# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
from __future__ import annotations

import time
import uuid

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import create_app
from tests.conftest import (
    SERVICE,
    User,
    assert_quiet,
    direct,
    expect,
    make_settings,
    send,
    socket,
    ticket,
)


def test_socket_without_a_valid_ticket_is_refused_before_the_upgrade(client: TestClient) -> None:
    for url in ("/chat/ws", "/chat/ws?ticket=", "/chat/ws?ticket=forged"):
        with pytest.raises(WebSocketDisconnect) as exc:
            with client.websocket_connect(url):
                pass
        assert exc.value.code == 4001, url


def test_ticket_works_once(client: TestClient, users: dict[str, User]) -> None:
    alice = users["alice"]
    one_time = ticket(client, alice)
    with client.websocket_connect(f"/chat/ws?ticket={one_time}") as ws:
        assert expect(ws, "ready")["data"]["user_id"] == alice.id
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/chat/ws?ticket={one_time}"):
            pass
    assert exc.value.code == 4001


def test_expired_ticket_is_refused(users: dict[str, User]) -> None:
    with TestClient(create_app(make_settings(chat_ws_ticket_ttl_s=0))) as client:
        stale = ticket(client, users["alice"])
        with pytest.raises(WebSocketDisconnect) as exc:
            with client.websocket_connect(f"/chat/ws?ticket={stale}"):
                pass
        assert exc.value.code == 4001


def test_ticket_requires_an_identity(client: TestClient) -> None:
    res = client.post("/chat/ws-ticket")
    assert res.status_code == 401
    ok = client.post("/chat/ws-ticket", headers={"X-User-Id": str(uuid.uuid4())})
    assert ok.status_code == 201
    assert ok.headers["cache-control"] == "no-store"
    assert ok.json()["expires_in"] == 30 and len(ok.json()["ticket"]) >= 40


def test_send_ack_and_fanout(client: TestClient, users: dict[str, User]) -> None:
    alice, bob = users["alice"], users["bob"]
    conv = direct(client, alice, bob)
    with socket(client, alice) as a1, socket(client, alice) as a2, socket(client, bob) as b:
        ack = send(a1, conv, "hello bob")
        msg = ack["data"]["message"]
        assert msg["seq"] == 1 and msg["body"] == "hello bob" and ack["data"]["duplicate"] is False
        assert msg["client_msg_id"] == ack["_sent"]["client_msg_id"]

        assert expect(b, "message.new")["data"]["message"]["id"] == msg["id"]
        # The sender's other device gets it too...
        assert expect(a2, "message.new")["data"]["message"]["id"] == msg["id"]
        # ...but the sending socket only gets the ack.
        assert_quiet(a1)

    inbox = client.get("/chat/conversations", headers=bob.headers).json()
    assert inbox[0]["me"]["unread_count"] == 1
    assert inbox[0]["last_message"]["body"] == "hello bob"
    # Sending marks your own message as read.
    mine = client.get("/chat/conversations", headers=alice.headers).json()[0]
    assert mine["me"]["unread_count"] == 0 and mine["me"]["read_seq"] == 1


def test_retry_with_same_client_msg_id_is_deduplicated(
    client: TestClient, users: dict[str, User]
) -> None:
    alice, bob = users["alice"], users["bob"]
    conv = direct(client, alice, bob)
    with socket(client, alice) as a, socket(client, bob) as b:
        first = send(a, conv, "once")
        expect(b, "message.new")
        a.send_json({"type": "send", "req_id": "retry", "data": first["_sent"]})
        again = expect(a, "ack")
        assert again["req_id"] == "retry"
        assert again["data"]["duplicate"] is True
        assert again["data"]["message"]["id"] == first["data"]["message"]["id"]
        assert_quiet(b)  # no second message.new
    assert client.get(f"/chat/conversations/{conv}", headers=alice.headers).json()["last_seq"] == 1


def test_receipts_only_move_forward(client: TestClient, users: dict[str, User]) -> None:
    alice, bob = users["alice"], users["bob"]
    conv = direct(client, alice, bob)
    with socket(client, alice) as a, socket(client, bob) as b:
        send(a, conv, "1")
        send(a, conv, "2")
        expect(b, "message.new")
        expect(b, "message.new")

        b.send_json({"type": "delivered", "data": {"conversation_id": conv, "seq": 2}})
        r = expect(a, "receipt")["data"]
        assert (r["user_id"], r["delivered_seq"], r["read_seq"]) == (bob.id, 2, 0)
        expect(b, "receipt")  # members (including yourself) get receipts

        b.send_json(
            {"type": "read", "data": {"conversation_id": conv, "seq": 99}}
        )  # clamped to last_seq
        r = expect(a, "receipt")["data"]
        assert (r["delivered_seq"], r["read_seq"]) == (2, 2)
        expect(b, "receipt")

        b.send_json({"type": "read", "data": {"conversation_id": conv, "seq": 1}})  # stale: no-op
        assert_quiet(a)


def test_typing_goes_to_others_only(client: TestClient, users: dict[str, User]) -> None:
    alice, bob = users["alice"], users["bob"]
    conv = direct(client, alice, bob)
    with socket(client, alice) as a, socket(client, bob) as b:
        a.send_json({"type": "typing", "data": {"conversation_id": conv}})
        t = expect(b, "typing")["data"]
        assert t == {"conversation_id": conv, "user_id": alice.id}
        assert_quiet(a)


def test_edit_and_delete_own_messages_only(client: TestClient, users: dict[str, User]) -> None:
    alice, bob = users["alice"], users["bob"]
    conv = direct(client, alice, bob)
    with socket(client, alice) as a, socket(client, bob) as b:
        msg = send(a, conv, "typo")["data"]["message"]
        expect(b, "message.new")

        a.send_json(
            {"type": "edit", "req_id": "e", "data": {"message_id": msg["id"], "body": "fixed"}}
        )
        assert expect(a, "ack", skip=("message.updated",))["data"]["message"]["body"] == "fixed"
        updated = expect(b, "message.updated")["data"]["message"]
        assert updated["body"] == "fixed" and updated["edited_at"]

        b.send_json({"type": "delete", "req_id": "d", "data": {"message_id": msg["id"]}})
        err = expect(b, "error")
        assert err["req_id"] == "d" and err["data"]["code"] == "not_allowed"

        a.send_json({"type": "delete", "req_id": "d2", "data": {"message_id": msg["id"]}})
        deleted = expect(a, "ack", skip=("message.updated",))["data"]["message"]
        assert deleted["deleted_at"] and deleted["body"] is None
        expect(b, "message.updated")


def test_replies_must_point_into_the_same_conversation(
    client: TestClient, users: dict[str, User]
) -> None:
    alice, bob, carol = users["alice"], users["bob"], users["carol"]
    conv = direct(client, alice, bob)
    other = direct(client, alice, carol)
    with socket(client, alice) as a:
        first = send(a, conv, "question")["data"]["message"]
        reply = send(a, conv, "follow-up", reply_to_id=first["id"])
        assert reply["data"]["message"]["reply_to_id"] == first["id"]

        a.send_json(
            {
                "type": "send",
                "req_id": "x",
                "data": {
                    "conversation_id": other,
                    "client_msg_id": str(uuid.uuid4()),
                    "kind": "text",
                    "body": "wrong",
                    "reply_to_id": first["id"],
                },
            }
        )
        assert expect(a, "error", skip=("conversation.added",))["data"]["code"] == "invalid_payload"


def test_payload_validation(client: TestClient, users: dict[str, User]) -> None:
    alice, bob = users["alice"], users["bob"]
    conv = direct(client, alice, bob)
    with socket(client, alice) as a:

        def attempt(data: dict) -> dict:
            a.send_json(
                {
                    "type": "send",
                    "req_id": "v",
                    "data": {
                        "conversation_id": conv,
                        "client_msg_id": str(uuid.uuid4()),
                        **data,
                    },
                }
            )
            return expect(a, "error")["data"]

        assert attempt({"kind": "text", "body": "   "})["code"] == "invalid_payload"
        assert (
            attempt({"kind": "location", "payload": {"lat": 200, "lng": 0}})["code"]
            == "invalid_payload"
        )
        assert (
            attempt({"kind": "image", "payload": {"url": "ftp://x"}})["code"] == "invalid_payload"
        )
        assert (
            attempt({"kind": "system", "payload": {"key": "x"}})["code"] == "invalid_payload"
        )  # clients can't

        a.send_json({"type": "nonsense", "req_id": "n"})
        err = expect(a, "error")
        assert err["req_id"] == "n" and err["data"]["code"] == "invalid_payload"

        loc = send(
            a,
            conv,
            kind="location",
            body=None,
            payload={"lat": 1.29, "lng": 103.85, "label": "Lobby"},
        )
        assert loc["data"]["message"]["payload"] == {"lat": 1.29, "lng": 103.85, "label": "Lobby"}


def test_non_members_and_closed_conversations(client: TestClient, users: dict[str, User]) -> None:
    alice, bob, carol = users["alice"], users["bob"], users["carol"]
    conv = direct(client, alice, bob)
    with socket(client, carol) as c:
        c.send_json(
            {
                "type": "send",
                "req_id": "s",
                "data": {
                    "conversation_id": conv,
                    "client_msg_id": str(uuid.uuid4()),
                    "body": "let me in",
                },
            }
        )
        assert expect(c, "error")["data"]["code"] == "not_member"

    client.post(f"/internal/conversations/{conv}/close", headers=SERVICE).raise_for_status()
    with socket(client, alice) as a:
        a.send_json(
            {
                "type": "send",
                "req_id": "s",
                "data": {
                    "conversation_id": conv,
                    "client_msg_id": str(uuid.uuid4()),
                    "body": "too late",
                },
            }
        )
        assert expect(a, "error")["data"]["code"] == "conversation_closed"


def test_rate_limit_closes_abusive_socket() -> None:
    settings = make_settings(send_rate_per_s=0.001, send_burst=2, max_rate_violations=2)
    with TestClient(create_app(settings)) as client:
        alice = User("rate-alice")
        with socket(client, alice) as a:
            for _ in range(2):
                a.send_json({"type": "ping"})
                expect(a, "pong")
            a.send_json({"type": "ping", "req_id": "x"})
            assert expect(a, "error")["data"]["code"] == "rate_limited"
            a.send_json({"type": "ping"})
            assert expect(a, "error")["data"]["code"] == "rate_limited"
            with pytest.raises(WebSocketDisconnect) as exc:
                a.receive_json()
            assert exc.value.code == 4008


def test_socket_is_closed_for_reauthentication_after_max_session(users: dict[str, User]) -> None:
    with TestClient(create_app(make_settings(chat_ws_max_session_s=1))) as client:
        with socket(client, users["alice"]) as ws:
            time.sleep(1.2)
            with pytest.raises(WebSocketDisconnect) as exc:
                ws.receive_json()
            assert exc.value.code == 4002
