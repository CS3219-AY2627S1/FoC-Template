# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
from __future__ import annotations

import json
import uuid

from fastapi.testclient import TestClient

from tests.conftest import SERVICE, User, assert_quiet, direct, expect, send, socket


def test_client_api_requires_the_gateway_identity_header(client: TestClient) -> None:
    assert client.get("/chat/conversations").status_code == 401
    assert client.get("/chat/conversations", headers={"X-User-Id": "not-a-uuid"}).status_code == 401
    # A bearer token means nothing in gateway mode: the gateway already verified it.
    assert (
        client.get("/chat/conversations", headers={"Authorization": "Bearer x"}).status_code == 401
    )


def test_direct_chat_is_get_or_create(client: TestClient, users: dict[str, User]) -> None:
    alice, bob = users["alice"], users["bob"]
    first = direct(client, alice, bob)
    assert direct(client, bob, alice) == first  # either side, same chat
    res = client.post(
        "/chat/conversations/direct", json={"user_id": alice.id}, headers=alice.headers
    )
    assert res.status_code == 422 and res.json()["code"] == "invalid_payload"


def test_group_creation_and_leaving(client: TestClient, users: dict[str, User]) -> None:
    alice, bob, carol = users["alice"], users["bob"], users["carol"]
    with socket(client, bob) as b:
        res = client.post(
            "/chat/conversations/group",
            json={"title": "Trip", "member_ids": [bob.id, carol.id]},
            headers=alice.headers,
        )
        assert res.status_code == 201
        group = res.json()
        assert group["last_message"]["payload"] == {
            "key": "group_created",
            "params": {"by": alice.id, "title": "Trip"},
        }
        added = expect(b, "conversation.added")["data"]["conversation"]
        assert added["id"] == group["id"] and len(added["members"]) == 3

        assert (
            client.post(
                f"/chat/conversations/{group['id']}/leave", headers=carol.headers
            ).status_code
            == 204
        )
        sysmsg = expect(b, "message.new")["data"]["message"]
        assert sysmsg["payload"] == {"key": "member_left", "params": {"user_id": carol.id}}
        assert len(expect(b, "conversation.updated")["data"]["conversation"]["members"]) == 2
    assert (
        client.get(f"/chat/conversations/{group['id']}", headers=carol.headers).status_code == 403
    )

    conv = direct(client, alice, bob)
    assert (
        client.post(f"/chat/conversations/{conv}/leave", headers=alice.headers).status_code == 403
    )


def test_history_paging(client: TestClient, users: dict[str, User]) -> None:
    alice, bob = users["alice"], users["bob"]
    conv = direct(client, alice, bob)
    with socket(client, alice) as a:
        for i in range(1, 8):
            send(a, conv, f"m{i}")
    url = f"/chat/conversations/{conv}/messages"

    latest = client.get(url, params={"limit": 3}, headers=bob.headers).json()
    assert [m["seq"] for m in latest["messages"]] == [5, 6, 7] and latest["has_more"]

    older = client.get(url, params={"limit": 3, "before_seq": 5}, headers=bob.headers).json()
    assert [m["seq"] for m in older["messages"]] == [2, 3, 4] and older["has_more"]

    catch_up = client.get(url, params={"after_seq": 4, "limit": 2}, headers=bob.headers).json()
    assert [m["seq"] for m in catch_up["messages"]] == [5, 6] and catch_up["has_more"]

    tail = client.get(url, params={"after_seq": 6}, headers=bob.headers).json()
    assert [m["seq"] for m in tail["messages"]] == [7] and not tail["has_more"]


def test_internal_api_requires_service_key(client: TestClient) -> None:
    assert client.post("/internal/conversations", json={}).status_code == 401
    assert (
        client.post(
            "/internal/conversations", json={}, headers={"X-Service-Key": "wrong"}
        ).status_code
        == 401
    )


def test_service_creates_conversation_idempotently_and_finds_it_by_metadata(
    client: TestClient, users: dict[str, User]
) -> None:
    alice, bob = users["alice"], users["bob"]
    body = {
        "unique_key": "order:123:courier",
        "title": "Order #123",
        "metadata": {"order_id": "123", "city": "SG"},
        "members": [
            {"user_id": alice.id, "label": "Customer"},
            {"user_id": bob.id, "label": "Courier"},
        ],
    }
    with socket(client, alice) as a:
        first = client.post("/internal/conversations", json=body, headers=SERVICE)
        assert first.status_code == 201 and first.json()["created"] is True
        conv = first.json()["conversation"]
        assert {m["label"] for m in conv["members"]} == {"Customer", "Courier"}
        assert expect(a, "conversation.added")["data"]["conversation"]["id"] == conv["id"]

        again = client.post("/internal/conversations", json=body, headers=SERVICE)
        assert again.status_code == 200 and again.json()["created"] is False
        assert again.json()["conversation"]["id"] == conv["id"]
        assert_quiet(a)  # retry doesn't re-announce

    other = client.post(
        "/internal/conversations",
        json={**body, "unique_key": "order:123:store", "members": []},
        headers=SERVICE,
    ).json()["conversation"]
    client.post(
        "/internal/conversations",
        json={**body, "unique_key": "order:999", "metadata": {"order_id": "999"}},
        headers=SERVICE,
    ).raise_for_status()

    found = client.get(
        "/internal/conversations",
        params={"metadata": json.dumps({"order_id": "123"})},
        headers=SERVICE,
    )
    assert {c["id"] for c in found.json()} == {conv["id"], other["id"]}
    by_key = client.get(
        "/internal/conversations", params={"unique_key": "order:123:courier"}, headers=SERVICE
    ).json()
    assert [c["id"] for c in by_key] == [conv["id"]]
    assert client.get("/internal/conversations", headers=SERVICE).status_code == 422


def test_member_added_without_history_cannot_see_earlier_messages(
    client: TestClient, users: dict[str, User]
) -> None:
    alice, bob, carol = users["alice"], users["bob"], users["carol"]
    conv = client.post(
        "/internal/conversations",
        json={
            "members": [{"user_id": alice.id}, {"user_id": bob.id}],
        },
        headers=SERVICE,
    ).json()["conversation"]["id"]
    with socket(client, alice) as a:
        send(a, conv, "before carol")
        with socket(client, carol) as c:
            client.post(
                f"/internal/conversations/{conv}/members",
                json={"user_id": carol.id, "label": "Support", "include_history": False},
                headers=SERVICE,
            ).raise_for_status()
            added = expect(c, "conversation.added")["data"]["conversation"]
            assert added["me"]["history_from_seq"] == 1 and added["me"]["unread_count"] == 1
            assert expect(a, "message.new")["data"]["message"]["payload"]["key"] == "member_added"
            expect(a, "conversation.updated")
            send(a, conv, "after carol")
            expect(c, "message.new")

    msgs = client.get(f"/chat/conversations/{conv}/messages", headers=carol.headers).json()[
        "messages"
    ]
    assert [m.get("body") or m["payload"]["key"] for m in msgs] == ["member_added", "after carol"]


def test_remove_member_and_close(client: TestClient, users: dict[str, User]) -> None:
    alice, bob = users["alice"], users["bob"]
    conv = client.post(
        "/internal/conversations",
        json={
            "members": [{"user_id": alice.id}, {"user_id": bob.id}],
        },
        headers=SERVICE,
    ).json()["conversation"]["id"]
    with socket(client, alice) as a, socket(client, bob) as b:
        client.delete(
            f"/internal/conversations/{conv}/members/{bob.id}", headers=SERVICE
        ).raise_for_status()
        assert expect(b, "conversation.removed")["data"]["conversation_id"] == conv
        expect(a, "message.new")
        expect(a, "conversation.updated")

        closed = client.post(f"/internal/conversations/{conv}/close", headers=SERVICE).json()
        assert closed["closed_at"]
        assert (
            expect(a, "message.new")["data"]["message"]["payload"]["key"] == "conversation_closed"
        )
        assert expect(a, "conversation.updated")["data"]["conversation"]["closed_at"]
        # Closing again is a no-op.
        assert (
            client.post(f"/internal/conversations/{conv}/close", headers=SERVICE).status_code == 200
        )
        assert_quiet(a)
        assert_quiet(b)


def test_service_system_message_and_metadata_patch(
    client: TestClient, users: dict[str, User]
) -> None:
    alice = users["alice"]
    conv = client.post(
        "/internal/conversations", json={"members": [{"user_id": alice.id}]}, headers=SERVICE
    ).json()["conversation"]["id"]
    with socket(client, alice) as a:
        res = client.post(
            f"/internal/conversations/{conv}/messages",
            json={"key": "order_picked_up", "params": {"eta_min": 12}},
            headers=SERVICE,
        )
        assert res.status_code == 201
        msg = expect(a, "message.new")["data"]["message"]
        assert msg["kind"] == "system" and msg["sender_id"] is None
        assert msg["payload"] == {"key": "order_picked_up", "params": {"eta_min": 12}}

        patched = client.patch(
            f"/internal/conversations/{conv}", json={"metadata": {"order_id": "7"}}, headers=SERVICE
        ).json()
        assert patched["metadata"] == {"order_id": "7"} and patched["title"] is None
        assert expect(a, "conversation.updated")["data"]["conversation"]["metadata"] == {
            "order_id": "7"
        }


def test_unknown_conversation_is_404(client: TestClient, users: dict[str, User]) -> None:
    missing = uuid.uuid4()
    assert (
        client.get(f"/chat/conversations/{missing}", headers=users["alice"].headers).status_code
        == 404
    )
    assert (
        client.post(f"/internal/conversations/{missing}/close", headers=SERVICE).status_code == 404
    )


def test_standalone_jwt_mode_verifies_bearer_tokens() -> None:
    import time

    import jwt

    from app.main import create_app
    from tests.conftest import make_settings

    settings = make_settings(chat_auth_mode="jwt")
    user_id = str(uuid.uuid4())
    good = jwt.encode(
        {"sub": user_id, "exp": int(time.time()) + 60}, settings.jwt_secret, algorithm="HS256"
    )
    expired = jwt.encode(
        {"sub": user_id, "exp": int(time.time()) - 60}, settings.jwt_secret, algorithm="HS256"
    )
    with TestClient(create_app(settings)) as client:
        assert client.get("/chat/conversations", headers={"X-User-Id": user_id}).status_code == 401
        bad = {"Authorization": f"Bearer {expired}"}
        assert client.get("/chat/conversations", headers=bad).status_code == 401
        ok = client.post("/chat/ws-ticket", headers={"Authorization": f"Bearer {good}"})
        assert ok.status_code == 201
        with client.websocket_connect(f"/chat/ws?ticket={ok.json()['ticket']}") as ws:
            assert ws.receive_json()["data"]["user_id"] == user_id


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}
    ready = client.get("/health/ready").json()
    assert ready["status"] == "ok" and ready["connections"] == 0
