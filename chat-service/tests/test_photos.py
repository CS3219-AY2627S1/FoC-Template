# AI-influenced: photo attachment tests written with Claude (Opus 5.5); see ai/usage-log.md.
"""Photos: upload, image messages, who may read them, and cleanup of stored objects."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from io import BytesIO
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import func, select, update

from app.db import make_engine, make_sessionmaker
from app.main import create_app
from app.models.attachments import Attachment
from app.models.conversations import Conversation
from app.realtime.broker import LocalBroker
from app.realtime.hub import Hub
from app.schemas.conversations import CreateConversationBody, MemberSpec
from app.schemas.frames import SendData
from app.services import photos
from app.state import AppState
from foc_shared.images import ImageData, ImageStorageError
from tests.conftest import (
    SERVICE,
    User,
    direct,
    expect,
    make_settings,
    socket,
    truncate_all,
)


class FakeStore:
    """In-memory stand-in for the private S3 bucket."""

    def __init__(self) -> None:
        self.objects: dict[str, ImageData] = {}
        self.fail_deletes = False
        # Runs during each upload, after the object is stored.
        self.on_upload: Callable[[], Awaitable[None]] | None = None

    async def upload(self, prefix: str, image: ImageData) -> str:
        key = f"{prefix}/{uuid.uuid4().hex}"
        self.objects[key] = image
        if self.on_upload is not None:
            await self.on_upload()
        return key

    async def get(self, key: str) -> ImageData:
        if key not in self.objects:
            raise ImageStorageError("missing")
        return self.objects[key]

    async def delete(self, key: str) -> None:
        if self.fail_deletes:
            raise ImageStorageError("bucket unavailable")
        self.objects.pop(key, None)


def png(width: int = 4, height: int = 3, color: str = "red") -> bytes:
    out = BytesIO()
    Image.new("RGB", (width, height), color).save(out, format="PNG")
    return out.getvalue()


@pytest.fixture
def store() -> FakeStore:
    return FakeStore()


@pytest.fixture
def client(store: FakeStore) -> Iterator[TestClient]:
    import asyncio

    asyncio.run(truncate_all())
    with TestClient(create_app(make_settings())) as c:
        c.app.state.chat.photos = store
        yield c


def upload(
    client: TestClient, user: User, conv: str, data: bytes | None = None, mime: str = "image/png"
) -> Any:
    files = {"file": ("photo", data if data is not None else png(), mime)}
    return client.post(f"/chat/conversations/{conv}/attachments", files=files, headers=user.headers)


def send_photo(ws: Any, conv: str, attachment_id: str, body: str | None = None) -> dict:
    ws.send_json(
        {
            "type": "send",
            "req_id": "p1",
            "data": {
                "conversation_id": conv,
                "client_msg_id": str(uuid.uuid4()),
                "kind": "image",
                "body": body,
                "payload": {"attachment_id": attachment_id},
            },
        }
    )
    return ws.receive_json()


def photo_url(conv: str, attachment_id: str) -> str:
    return f"/chat/conversations/{conv}/attachments/{attachment_id}"


# ---------------------------------------------------------------------------------------
# Upload, send, read


def test_photo_round_trip(client: TestClient, store: FakeStore, users: dict[str, User]) -> None:
    alice, bob = users["alice"], users["bob"]
    conv = direct(client, alice, bob)
    res = upload(client, alice, conv, png(8, 5))
    assert res.status_code == 201, res.text
    photo = res.json()
    assert photo | {"attachment_id": "x"} == {
        "attachment_id": "x",
        "content_type": "image/png",
        "size": photo["size"],
        "width": 8,
        "height": 5,
    }
    [key] = store.objects
    assert key.startswith(f"chat/{conv}/")

    with socket(client, alice) as a, socket(client, bob) as b:
        ack = send_photo(a, conv, photo["attachment_id"], body="Here's the receipt")
        assert ack["type"] == "ack", ack
        message = ack["data"]["message"]
        assert message["kind"] == "image" and message["body"] == "Here's the receipt"
        assert message["payload"] == {
            "attachment_id": photo["attachment_id"],
            "mime": "image/png",
            "size": photo["size"],
            "width": 8,
            "height": 5,
        }
        assert "object_key" not in str(message) and key not in str(message)
        assert expect(b, "message.new")["data"]["message"]["id"] == message["id"]

    got = client.get(photo_url(conv, photo["attachment_id"]), headers=bob.headers)
    assert got.status_code == 200
    assert got.headers["content-type"] == "image/png"
    assert got.headers["cache-control"] == "private, no-store"
    assert got.headers["x-content-type-options"] == "nosniff"
    with Image.open(BytesIO(got.content)) as image:
        assert image.size == (8, 5)


def test_uploads_are_validated(client: TestClient, users: dict[str, User]) -> None:
    alice, bob, carol = users["alice"], users["bob"], users["carol"]
    conv = direct(client, alice, bob)
    not_image = upload(client, alice, conv, b"definitely not a picture")
    assert not_image.status_code == 422 and not_image.json()["code"] == "invalid_image"
    lying = upload(client, alice, conv, png(), mime="image/jpeg")
    assert lying.status_code == 422
    too_big = upload(client, alice, conv, b"\0" * (5 * 1024 * 1024 + 1))
    assert too_big.status_code == 422
    assert upload(client, carol, conv).status_code == 403  # not a member
    missing = upload(client, alice, str(uuid.uuid4()))
    assert missing.status_code == 404


def test_closed_chats_take_no_photos(client: TestClient, users: dict[str, User]) -> None:
    alice, bob = users["alice"], users["bob"]
    conv = direct(client, alice, bob)
    client.post(f"/internal/conversations/{conv}/close", headers=SERVICE).raise_for_status()
    res = upload(client, alice, conv)
    assert res.status_code == 409 and res.json()["code"] == "conversation_closed"


def test_uploads_hold_no_database_connection_while_storing(
    client: TestClient, store: FakeStore, users: dict[str, User]
) -> None:
    alice, bob = users["alice"], users["bob"]
    conv = direct(client, alice, bob)
    pool = client.app.state.chat.sessionmaker.kw["bind"].sync_engine.pool
    in_use: list[int] = []

    async def during_upload() -> None:
        in_use.append(pool.checkedout())

    store.on_upload = during_upload
    assert upload(client, alice, conv).status_code == 201
    assert in_use == [0]


def test_chat_closed_during_an_upload_keeps_no_object(
    client: TestClient, store: FakeStore, users: dict[str, User]
) -> None:
    alice, bob = users["alice"], users["bob"]
    conv = direct(client, alice, bob)
    state = client.app.state.chat

    async def close_meanwhile() -> None:
        async with state.sessionmaker() as session, session.begin():
            await session.execute(
                update(Conversation)
                .where(Conversation.id == uuid.UUID(conv))
                .values(closed_at=func.now())
            )

    store.on_upload = close_meanwhile
    res = upload(client, alice, conv)
    assert res.status_code == 409 and res.json()["code"] == "conversation_closed"
    assert store.objects == {}


def test_failed_insert_keeps_no_object(
    client: TestClient, store: FakeStore, users: dict[str, User], monkeypatch: pytest.MonkeyPatch
) -> None:
    alice, bob = users["alice"], users["bob"]
    conv = direct(client, alice, bob)

    async def broken(*_: Any, **__: Any) -> None:
        raise RuntimeError("insert failed")

    monkeypatch.setattr(photos.attachment_repo, "create", broken)
    with pytest.raises(RuntimeError, match="insert failed"):
        upload(client, alice, conv)
    assert store.objects == {}


def test_photos_switched_off_without_a_bucket(users: dict[str, User]) -> None:
    with TestClient(create_app(make_settings())) as client:
        assert client.app.state.chat.photos is None  # no CHAT_PHOTO_BUCKET
        alice, bob = users["alice"], users["bob"]
        conv = direct(client, alice, bob)
        res = upload(client, alice, conv)
        assert res.status_code == 503 and res.json()["code"] == "photos_unavailable"


def test_unsent_uploads_are_capped(users: dict[str, User], store: FakeStore) -> None:
    with TestClient(create_app(make_settings(chat_photo_max_unsent=2))) as client:
        client.app.state.chat.photos = store
        alice, bob = users["alice"], users["bob"]
        conv = direct(client, alice, bob)
        assert upload(client, alice, conv).status_code == 201
        assert upload(client, alice, conv).status_code == 201
        third = upload(client, alice, conv)
        assert third.status_code == 429 and third.json()["code"] == "too_many_uploads"


def test_only_your_own_unsent_photo_can_be_sent(client: TestClient, users: dict[str, User]) -> None:
    alice, bob, carol = users["alice"], users["bob"], users["carol"]
    conv = direct(client, alice, bob)
    other = direct(client, alice, carol)
    bobs = upload(client, bob, conv).json()["attachment_id"]
    elsewhere = upload(client, alice, other).json()["attachment_id"]
    mine = upload(client, alice, conv).json()["attachment_id"]
    with socket(client, alice) as ws:
        for attachment_id in (bobs, elsewhere, str(uuid.uuid4()), "not-a-uuid"):
            reply = send_photo(ws, conv, attachment_id)
            assert reply["type"] == "error", (attachment_id, reply)
            assert reply["data"]["code"] == "invalid_payload"
        assert send_photo(ws, conv, mine)["type"] == "ack"
        reused = send_photo(ws, conv, mine)
        assert reused["type"] == "error" and reused["data"]["code"] == "invalid_payload"


def test_link_images_are_no_longer_accepted(client: TestClient, users: dict[str, User]) -> None:
    alice, bob = users["alice"], users["bob"]
    conv = direct(client, alice, bob)
    with socket(client, alice) as ws:
        ws.send_json(
            {
                "type": "send",
                "req_id": "x",
                "data": {
                    "conversation_id": conv,
                    "client_msg_id": str(uuid.uuid4()),
                    "kind": "image",
                    "payload": {"url": "https://tracker.example/pixel.png"},
                },
            }
        )
        reply = ws.receive_json()
        assert reply["type"] == "error" and reply["data"]["code"] == "invalid_payload"


# ---------------------------------------------------------------------------------------
# Who may read a photo


def test_photo_visibility(client: TestClient, users: dict[str, User]) -> None:
    alice, bob, carol = users["alice"], users["bob"], users["carol"]
    res = client.post(
        "/internal/conversations",
        json={"members": [{"user_id": alice.id}, {"user_id": bob.id}], "title": "Order chat"},
        headers=SERVICE,
    )
    conv = res.json()["conversation"]["id"]

    unsent = upload(client, alice, conv).json()["attachment_id"]
    assert client.get(photo_url(conv, unsent), headers=alice.headers).status_code == 200
    assert client.get(photo_url(conv, unsent), headers=bob.headers).status_code == 404

    with socket(client, alice) as ws:
        sent = upload(client, alice, conv).json()["attachment_id"]
        send_photo(ws, conv, sent)
        deleted = upload(client, alice, conv).json()["attachment_id"]
        deleted_msg = send_photo(ws, conv, deleted)["data"]["message"]["id"]
        ws.send_json({"type": "delete", "req_id": "d", "data": {"message_id": deleted_msg}})
        expect(ws, "ack", skip=("message.updated",))

    assert client.get(photo_url(conv, sent), headers=bob.headers).status_code == 200
    assert client.get(photo_url(conv, deleted), headers=bob.headers).status_code == 404
    # Not a member: refused; and the wrong conversation id never matches.
    assert client.get(photo_url(conv, sent), headers=carol.headers).status_code == 403
    other = direct(client, alice, carol)
    assert client.get(photo_url(other, sent), headers=alice.headers).status_code == 404

    # A member who joins without history (e.g. a new courier) cannot read older photos.
    client.post(
        f"/internal/conversations/{conv}/members",
        json={"user_id": carol.id, "include_history": False},
        headers=SERVICE,
    ).raise_for_status()
    assert client.get(photo_url(conv, sent), headers=carol.headers).status_code == 404
    with socket(client, alice) as ws:
        later = upload(client, alice, conv).json()["attachment_id"]
        send_photo(ws, conv, later)
    assert client.get(photo_url(conv, later), headers=carol.headers).status_code == 200

    # Removed members lose access.
    client.delete(
        f"/internal/conversations/{conv}/members/{bob.id}", headers=SERVICE
    ).raise_for_status()
    assert client.get(photo_url(conv, sent), headers=bob.headers).status_code == 403


# ---------------------------------------------------------------------------------------
# Cleanup


@pytest.fixture
async def state(store: FakeStore) -> AsyncIterator[AppState]:
    settings = make_settings(chat_photo_unsent_ttl_s=3600)
    await truncate_all()
    engine = make_engine(settings.database_url)
    hub = Hub()
    yield AppState(settings, make_sessionmaker(engine), hub, LocalBroker(hub), photos=store)
    await engine.dispose()


async def _chat(state: AppState, a: uuid.UUID, b: uuid.UUID) -> uuid.UUID:
    view, _ = await state.run(
        lambda s: s.create_conversation(
            CreateConversationBody(members=[MemberSpec(user_id=a), MemberSpec(user_id=b)])
        )
    )
    return uuid.UUID(view["id"])


async def _photo(state: AppState, user: uuid.UUID, conv: uuid.UUID) -> uuid.UUID:
    stored = await photos.store_image(state.photos, state.settings, conv, png(), "image/png")
    row = await state.run(lambda s: photos.record(s, state.photos, user, conv, stored))
    return row.id


async def _send(state: AppState, user: uuid.UUID, conv: uuid.UUID, photo: uuid.UUID) -> str:
    data = SendData(
        conversation_id=conv,
        client_msg_id=uuid.uuid4(),
        kind="image",
        payload={"attachment_id": str(photo)},
    )
    result = await state.run(lambda s: s.send(user, data))
    return result.message["id"]


async def _rows(state: AppState) -> int:
    async with state.sessionmaker() as session:
        return await session.scalar(select(func.count()).select_from(Attachment)) or 0


async def test_sweep_deletes_objects_nobody_can_reach(state: AppState, store: FakeStore) -> None:
    alice, bob = uuid.uuid4(), uuid.uuid4()
    conv = await _chat(state, alice, bob)
    kept = await _photo(state, alice, conv)
    await _send(state, alice, conv, kept)
    deleted = await _photo(state, alice, conv)
    deleted_msg = await _send(state, alice, conv, deleted)
    await state.run(lambda s: s.delete(alice, uuid.UUID(deleted_msg)))
    recent_unsent = await _photo(state, alice, conv)
    old_unsent = await _photo(state, alice, conv)
    async with state.sessionmaker() as session, session.begin():
        await session.execute(
            update(Attachment)
            .where(Attachment.id == old_unsent)
            .values(created_at=func.now() - func.make_interval(0, 0, 0, 0, 2))
        )
    assert len(store.objects) == 4

    removed = await state.run(lambda s: photos.sweep(s, store))
    assert removed == 2  # the deleted message's photo and the stale upload
    async with state.sessionmaker() as session:
        left = set(await session.scalars(select(Attachment.id)))
    assert left == {kept, recent_unsent}
    assert len(store.objects) == 2

    # Purging the conversation leaves its photos to the sweep, which removes them.
    async with state.sessionmaker() as session, session.begin():
        await session.execute(
            update(Conversation).where(Conversation.id == conv).values(purge_after=func.now())
        )
    await state.run(lambda s: s.purge_expired())
    assert await _rows(state) == 2  # rows survive the purge (conversation_id SET NULL)
    assert await state.run(lambda s: photos.sweep(s, store)) == 2
    assert await _rows(state) == 0 and store.objects == {}


async def test_sweep_keeps_rows_when_the_bucket_is_down(state: AppState, store: FakeStore) -> None:
    alice, bob = uuid.uuid4(), uuid.uuid4()
    conv = await _chat(state, alice, bob)
    photo = await _photo(state, alice, conv)
    msg = await _send(state, alice, conv, photo)
    await state.run(lambda s: s.delete(alice, uuid.UUID(msg)))
    store.fail_deletes = True
    assert await state.run(lambda s: photos.sweep(s, store)) == 0
    assert await _rows(state) == 1  # retried next time
    store.fail_deletes = False
    assert await state.run(lambda s: photos.sweep(s, store)) == 1
    assert await _rows(state) == 0
