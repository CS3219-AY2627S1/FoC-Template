# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10, 2026-10-11
# Scope: Added or extended tests for multi-process delivery, unread updates, and reconnect
# recovery.
# Author review: I validated correctness and added boundary checks where needed.

import asyncio
import contextlib
import json
import os
import subprocess
import sys
from pathlib import Path
from uuid import UUID, uuid4

import aio_pika
import httpx
import pytest
import pytest_asyncio
from sqlalchemy import text
from websockets.asyncio.client import connect

from app.config import Settings
from app.events import Envelope
from app.live import Connection, Hub
from app.outbox import Publisher
from tests.test_messages import send


@pytest.fixture
def broker_url():
    value = os.getenv("CHAT_TEST_RABBITMQ_URL")
    if not value:
        pytest.skip("CHAT_TEST_RABBITMQ_URL is not configured")
    from urllib.parse import urlsplit

    parsed = urlsplit(value)
    if parsed.hostname not in {"127.0.0.1", "localhost"} or parsed.port != 17425:
        pytest.fail("Broker tests require the isolated local port 17425")
    return value


async def receive(ws, kind, timeout=10):
    async with asyncio.timeout(timeout):
        while True:
            item = json.loads(await ws.recv())
            if item["type"] == kind:
                return item


@pytest_asyncio.fixture
async def processes(database, broker_url):
    root = Path(__file__).resolve().parents[1]
    env = {
        **os.environ,
        "DATABASE_URL": os.environ["CHAT_TEST_DATABASE_URL"],
        "RABBITMQ_URL": broker_url,
        "CHAT_SERVICE_SHARED_SECRET": "test-chat-secret",
        "USER_SERVICE_BASE_URL": "http://127.0.0.1:17430",
        "WEBSOCKET_SESSION_CHECK_SECONDS": "0.2",
        "OUTBOX_POLL_SECONDS": "0.1",
    }
    children = []
    try:
        for module, port in (
            ("tests.runtime:identity_app", 17430),
            ("app.main:app", 17431),
            ("app.main:app", 17432),
        ):
            children.append(
                subprocess.Popen(
                    [
                        sys.executable,
                        "-m",
                        "uvicorn",
                        module,
                        "--host",
                        "127.0.0.1",
                        "--port",
                        str(port),
                        "--no-access-log",
                        "--log-level",
                        "critical",
                        "--ws-max-size",
                        "65536",
                    ],
                    cwd=root,
                    env=env,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                )
            )
        async with httpx.AsyncClient(timeout=1) as client:
            async with asyncio.timeout(30):
                while True:
                    try:
                        identity_ready = await client.get("http://127.0.0.1:17430/health/ready")
                        assert identity_ready.status_code == 200
                        for port in (17431, 17432):
                            r = await client.get(f"http://127.0.0.1:{port}/health/ready")
                            assert r.status_code == 200 and r.json()["delivery"] == "ready"
                        break
                    except (httpx.HTTPError, AssertionError):
                        await asyncio.sleep(0.2)
        children.append(
            subprocess.Popen(
                [sys.executable, "-m", "app.outbox"],
                cwd=root,
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
        )
        yield env
    finally:
        for child in children:
            child.terminate()
        for child in children:
            with contextlib.suppress(subprocess.TimeoutExpired):
                child.wait(timeout=5)
            if child.poll() is None:
                child.kill()
                child.wait(timeout=5)


@pytest.mark.integration
@pytest.mark.broker
async def test_cross_process_delivery_retries_and_revocation(processes, database, broker_url):
    async with httpx.AsyncClient() as client:
        a = (await client.post("http://127.0.0.1:17430/test/users")).json()
        b = (await client.post("http://127.0.0.1:17430/test/users")).json()
        c = (await client.post("http://127.0.0.1:17430/test/users")).json()
        headers = {"Authorization": f"Bearer {a['accessToken']}"}
        r = await client.post(
            "http://127.0.0.1:17431/v1/chat/conversations",
            headers=headers,
            json={"recipientUserId": b["userId"]},
        )
        assert r.status_code == 200, r.text
        cid = r.json()["conversationId"]
        async with (
            connect("ws://127.0.0.1:17431/v1/chat/ws", origin="http://localhost:3000") as wa,
            connect("ws://127.0.0.1:17432/v1/chat/ws", origin="http://localhost:3000") as wb,
            connect("ws://127.0.0.1:17432/v1/chat/ws", origin="http://localhost:3000") as wc,
        ):
            for ws, user in ((wa, a), (wb, b), (wc, c)):
                await ws.send(
                    json.dumps({"type": "authenticate", "accessToken": user["accessToken"]})
                )
                assert (await receive(ws, "ready"))["userId"] == user["userId"]
            command = send(UUID(cid), "persistent across processes").model_dump(mode="json")
            await wa.send(json.dumps(command))
            accepted = (await receive(wa, "message.accepted"))["message"]
            received = (await receive(wb, "message.created"))["message"]
            assert accepted == received
            # JSON's escaped surrogate pairs must still allow 4096 Unicode code points.
            emoji = send(UUID(cid), "😀" * 4096).model_dump(mode="json")
            await wa.send(json.dumps(emoji))
            assert len((await receive(wa, "message.accepted"))["message"]["text"]) == 4096
            assert len((await receive(wb, "message.created"))["message"]["text"]) == 4096
            await wa.send(json.dumps(command))
            assert (await receive(wa, "message.accepted"))["message"] == accepted
            await wc.send(json.dumps({**command, "clientMessageId": str(uuid4())}))
            assert (await receive(wc, "error"))["error"]["code"] == "CONVERSATION_NOT_FOUND"
            # Duplicate broker event must not produce a second rendered-message event.
            connection = await aio_pika.connect(broker_url)
            try:
                channel = await connection.channel()
                exchange = await channel.get_exchange("foc.chat.events")
                event = {
                    "eventId": str(uuid4()),
                    "eventType": "chat.message.created.v1",
                    "data": {
                        "conversationId": cid,
                        "messageId": accepted["messageId"],
                        "sequence": 1,
                    },
                }
                for _ in range(2):
                    await exchange.publish(
                        aio_pika.Message(json.dumps(event).encode()),
                        routing_key="chat.message.created.v1",
                        mandatory=False,
                    )
                with pytest.raises(TimeoutError):
                    await receive(wb, "message.created", timeout=0.4)
            finally:
                await connection.close()
            await client.post(
                "http://127.0.0.1:17430/test/revoke", json={"token": b["accessToken"]}
            )
            from websockets.exceptions import ConnectionClosed

            with pytest.raises(ConnectionClosed):
                async with asyncio.timeout(3):
                    while True:
                        await wb.recv()


@pytest.mark.integration
@pytest.mark.broker
async def test_publisher_confirm_lease_and_minimal_payload(
    database, identity, directory, broker_url
):
    from app.service import ChatService

    a, b = directory.user(), directory.user()
    chat = ChatService(database, identity)
    cid = UUID((await chat.create(a, b))["conversationId"])
    stored = await chat.send(a, send(cid, "never publish this body"))
    publisher = Publisher(Settings(_env_file=None, rabbitmq_url=broker_url), database)
    # Drain preceding test events; these resources belong exclusively to Chat Service.
    try:
        while await publisher.run_once():
            pass
        async with database.transaction() as session:
            row = (
                (
                    await session.execute(
                        text(
                            "SELECT * FROM chat_service.outbox_events "
                            "WHERE payload->>'messageId'=:mid"
                        ),
                        {"mid": stored["messageId"]},
                    )
                )
                .mappings()
                .one()
            )
            assert row["published_at"] is not None and row["lease_token"] is None
            assert set(row["payload"]) == {"conversationId", "messageId", "sequence"}
        # Two workers cannot claim the same leased event.
        await chat.send(a, send(cid))
        p2 = Publisher(Settings(_env_file=None, rabbitmq_url=broker_url), database)
        claims = await asyncio.gather(publisher.claim(), p2.claim())
        claimed = [r for r in claims if r]
        assert len({r["id"] for r in claimed}) == len(claimed)
        for row in claimed:
            await publisher.publish(row)
            await publisher.finish(row, True)
        await p2.close()
    finally:
        await publisher.close()


def test_outgoing_buffer_is_bounded():
    from app.identity import Principal

    connection = Connection(None, Principal(uuid4(), 9999999999, "token"), asyncio.Queue(1))
    connection.offer({"type": "ready"})
    connection.offer({"type": "ready"})
    assert connection.stopped.is_set() and connection.close_code == 1013


@pytest.mark.integration
@pytest.mark.broker
async def test_read_sync_only_to_reader(processes):
    async with httpx.AsyncClient() as client:
        a = (await client.post("http://127.0.0.1:17430/test/users")).json()
        b = (await client.post("http://127.0.0.1:17430/test/users")).json()
        cid = (
            await client.post(
                "http://127.0.0.1:17431/v1/chat/conversations",
                headers={"Authorization": f"Bearer {a['accessToken']}"},
                json={"recipientUserId": b["userId"]},
            )
        ).json()["conversationId"]
        async with (
            connect("ws://127.0.0.1:17431/v1/chat/ws", origin="http://localhost:3000") as wa,
            connect("ws://127.0.0.1:17432/v1/chat/ws", origin="http://localhost:3000") as wb,
            connect("ws://127.0.0.1:17431/v1/chat/ws", origin="http://localhost:3000") as wb2,
        ):
            for ws, user in ((wa, a), (wb, b), (wb2, b)):
                await ws.send(
                    json.dumps({"type": "authenticate", "accessToken": user["accessToken"]})
                )
                await receive(ws, "ready")
            await wa.send(json.dumps(send(UUID(cid)).model_dump(mode="json")))
            await receive(wa, "message.accepted")
            await receive(wb, "message.created")
            await receive(wb2, "message.created")
            await wb.send(
                json.dumps(
                    {
                        "type": "conversation.read",
                        "requestId": str(uuid4()),
                        "conversationId": cid,
                        "upToSequence": 1,
                    }
                )
            )
            assert (await receive(wb, "unread.updated"))["unreadCount"] == 0
            state = await receive(wb2, "unread.updated")
            assert state["lastReadSequence"] == 1 and state["unreadCount"] == 0
            with pytest.raises(TimeoutError):
                await receive(wa, "unread.updated", timeout=0.3)


@pytest.mark.integration
@pytest.mark.broker
async def test_broker_interruption_and_resubscription(processes, database):
    if os.getenv("CHAT_TEST_BROKER_RESTART") != "1":
        pytest.skip("Set CHAT_TEST_BROKER_RESTART=1 to restart the dedicated local test broker")
    bindings = subprocess.check_output(
        [
            "docker",
            "inspect",
            "--format",
            "{{json .HostConfig.PortBindings}}",
            "foc-chat-test-rabbitmq",
        ],
        text=True,
    )
    assert json.loads(bindings)["5672/tcp"] == [{"HostIp": "127.0.0.1", "HostPort": "17425"}]
    stopped = False
    try:
        async with httpx.AsyncClient() as client:
            a = (await client.post("http://127.0.0.1:17430/test/users")).json()
            b = (await client.post("http://127.0.0.1:17430/test/users")).json()
            headers = {"Authorization": f"Bearer {a['accessToken']}"}
            cid = (
                await client.post(
                    "http://127.0.0.1:17431/v1/chat/conversations",
                    headers=headers,
                    json={"recipientUserId": b["userId"]},
                )
            ).json()["conversationId"]
            async with (
                connect("ws://127.0.0.1:17431/v1/chat/ws", origin="http://localhost:3000") as wa,
                connect("ws://127.0.0.1:17432/v1/chat/ws", origin="http://localhost:3000") as wb,
            ):
                for ws, user in ((wa, a), (wb, b)):
                    await ws.send(
                        json.dumps({"type": "authenticate", "accessToken": user["accessToken"]})
                    )
                    await receive(ws, "ready")
                await asyncio.to_thread(
                    subprocess.run,
                    ["docker", "stop", "--time", "1", "foc-chat-test-rabbitmq"],
                    check=True,
                    stdout=subprocess.DEVNULL,
                )
                stopped = True
                await receive(wb, "sync.required")
                command = send(UUID(cid), "committed while broker offline").model_dump(mode="json")
                await wa.send(json.dumps(command))
                accepted = (await receive(wa, "message.accepted"))["message"]
                await wa.send(json.dumps(command))
                assert (await receive(wa, "message.accepted"))["message"] == accepted
                await asyncio.to_thread(
                    subprocess.run,
                    ["docker", "start", "foc-chat-test-rabbitmq"],
                    check=True,
                    stdout=subprocess.DEVNULL,
                )
                stopped = False
                await receive(wb, "sync.required", timeout=25)
                history = (
                    await client.get(
                        f"http://127.0.0.1:17432/v1/chat/conversations/{cid}/messages",
                        headers={"Authorization": f"Bearer {b['accessToken']}"},
                        params={"afterSequence": 0},
                    )
                ).json()
                assert history["items"] == [accepted]
                async with asyncio.timeout(20):
                    while True:
                        async with database.transaction() as session:
                            published = (
                                await session.execute(
                                    text(
                                        "SELECT published_at FROM "
                                        "chat_service.outbox_events WHERE payload->>'messageId'=:id"
                                    ),
                                    {"id": accepted["messageId"]},
                                )
                            ).scalar_one()
                        if published:
                            break
                        await asyncio.sleep(0.2)
    finally:
        if stopped:
            subprocess.run(
                ["docker", "start", "foc-chat-test-rabbitmq"], check=True, stdout=subprocess.DEVNULL
            )


@pytest.mark.integration
async def test_live_block_status_and_authoritative_event(chat, directory):
    a, b, c = directory.user(), directory.user(), directory.user()
    cid = UUID((await chat.create(a, b))["conversationId"])
    stored = await chat.send(a, send(cid))
    envelope = Envelope(
        eventId=uuid4(),
        eventType="chat.message.created.v1",
        data={"conversationId": str(cid), "messageId": stored["messageId"], "sequence": 1},
    )
    hub = Hub(chat, Settings(_env_file=None))
    from app.events import MessageEvent

    event = MessageEvent.model_validate(envelope.data)
    assert await chat.live_message(c, event) is None
    assert await chat.live_message(b, event) == stored
    await chat.set_block(b, a, True)
    assert await chat.live_message(b, event) is None
    await chat.set_block(b, a, False)
    directory.people[a]["accountStatus"] = "DELETED"
    assert await chat.live_message(b, event) is None
    hub.sync()  # empty hub is safe on subscription churn


@pytest.mark.integration
async def test_blocked_event_is_consumed_without_unblock_replay(chat, directory, identity):
    from app.events import MessageEvent
    from app.live import writer

    a, b = directory.user(), directory.user()
    cid = UUID((await chat.create(a, b))["conversationId"])
    stored = await chat.send(a, send(cid))
    event = MessageEvent(conversationId=cid, messageId=UUID(stored["messageId"]), sequence=1)
    principal = await identity.authenticate(directory.token(b))

    class Socket:
        def __init__(self):
            self.frames = []
            self.done = asyncio.Event()

        async def send_json(self, frame):
            self.frames.append(frame)
            self.done.set()

    socket = Socket()
    connection = Connection(socket, principal, asyncio.Queue(4))
    task = asyncio.create_task(writer(connection, chat, identity))
    try:
        await chat.set_block(b, a, True)
        connection.offer(event)
        async with asyncio.timeout(3):
            while str(event.messageId) not in connection.seen:
                await asyncio.sleep(0.01)
        await chat.set_block(b, a, False)
        connection.offer(event)
        connection.offer({"type": "pong"})
        await asyncio.wait_for(socket.done.wait(), timeout=3)
        assert socket.frames == [{"type": "pong"}]
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


@pytest.mark.integration
@pytest.mark.broker
async def test_lost_acceptance_and_out_of_order_events(processes, broker_url):
    async with httpx.AsyncClient() as client:
        a = (await client.post("http://127.0.0.1:17430/test/users")).json()
        b = (await client.post("http://127.0.0.1:17430/test/users")).json()
        headers = {"Authorization": f"Bearer {a['accessToken']}"}
        cid = (
            await client.post(
                "http://127.0.0.1:17431/v1/chat/conversations",
                headers=headers,
                json={"recipientUserId": b["userId"]},
            )
        ).json()["conversationId"]
        async with (
            connect("ws://127.0.0.1:17431/v1/chat/ws", origin="http://localhost:3000") as wa,
            connect("ws://127.0.0.1:17432/v1/chat/ws", origin="http://localhost:3000") as wb,
        ):
            for ws, user in ((wa, a), (wb, b)):
                await ws.send(
                    json.dumps({"type": "authenticate", "accessToken": user["accessToken"]})
                )
                await receive(ws, "ready")
            command = send(UUID(cid)).model_dump(mode="json")
            await wa.send(json.dumps(command))
            first = (await receive(wb, "message.created"))["message"]
            # Sender closes without consuming its acceptance frame; recipient proves persistence.
        async with connect("ws://127.0.0.1:17431/v1/chat/ws", origin="http://localhost:3000") as wa:
            await wa.send(json.dumps({"type": "authenticate", "accessToken": a["accessToken"]}))
            await receive(wa, "ready")
            await wa.send(json.dumps(command))
            assert (await receive(wa, "message.accepted"))["message"] == first
            stored = [first]
            for _ in range(2):
                await wa.send(json.dumps(send(UUID(cid)).model_dump(mode="json")))
                stored.append((await receive(wa, "message.accepted"))["message"])
        # Wait for committed events to leave the outbox before opening a fresh recipient socket.
        await asyncio.sleep(0.3)
        async with connect("ws://127.0.0.1:17432/v1/chat/ws", origin="http://localhost:3000") as wb:
            await wb.send(json.dumps({"type": "authenticate", "accessToken": b["accessToken"]}))
            await receive(wb, "ready")
            connection = await aio_pika.connect(broker_url)
            try:
                exchange = await (await connection.channel()).get_exchange("foc.chat.events")
                for message in reversed(stored):
                    envelope = {
                        "eventId": str(uuid4()),
                        "eventType": "chat.message.created.v1",
                        "data": {
                            "conversationId": cid,
                            "messageId": message["messageId"],
                            "sequence": message["sequence"],
                        },
                    }
                    await exchange.publish(
                        aio_pika.Message(json.dumps(envelope).encode()),
                        routing_key="chat.message.created.v1",
                        mandatory=False,
                    )
                assert (await receive(wb, "sync.required"))["reason"] == "sequence_gap"
                received = [
                    (await receive(wb, "message.created"))["message"]["sequence"] for _ in range(3)
                ]
                assert received == [3, 2, 1]
            finally:
                await connection.close()
        response = await client.get(
            f"http://127.0.0.1:17432/v1/chat/conversations/{cid}/messages",
            headers={"Authorization": f"Bearer {b['accessToken']}"},
            params={"afterSequence": 1},
        )
        assert [m["sequence"] for m in response.json()["items"]] == [2, 3]


@pytest.mark.integration
@pytest.mark.broker
async def test_database_interruption_fails_closed_then_recovers(processes):
    if os.getenv("CHAT_TEST_DATABASE_RESTART") != "1":
        pytest.skip("Set CHAT_TEST_DATABASE_RESTART=1 for isolated database restart verification")
    bindings = subprocess.check_output(
        [
            "docker",
            "inspect",
            "--format",
            "{{json .HostConfig.PortBindings}}",
            "supabase_db_foc-chat-service",
        ],
        text=True,
    )
    assert json.loads(bindings)["5432/tcp"][0]["HostPort"] == "17422"
    stopped = False
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            a = (await client.post("http://127.0.0.1:17430/test/users")).json()
            b = (await client.post("http://127.0.0.1:17430/test/users")).json()
            headers = {"Authorization": f"Bearer {a['accessToken']}"}
            cid = (
                await client.post(
                    "http://127.0.0.1:17431/v1/chat/conversations",
                    headers=headers,
                    json={"recipientUserId": b["userId"]},
                )
            ).json()["conversationId"]
            await asyncio.to_thread(
                subprocess.run,
                ["docker", "stop", "--time", "1", "supabase_db_foc-chat-service"],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            stopped = True
            response = await client.get("http://127.0.0.1:17431/health/ready")
            assert response.status_code == 503
            response = await client.get(
                "http://127.0.0.1:17431/v1/chat/conversations", headers=headers
            )
            assert response.status_code == 503
            await asyncio.to_thread(
                subprocess.run,
                ["docker", "start", "supabase_db_foc-chat-service"],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            stopped = False
            async with asyncio.timeout(25):
                while (await client.get("http://127.0.0.1:17431/health/ready")).status_code != 200:
                    await asyncio.sleep(0.2)
            response = await client.get(
                f"http://127.0.0.1:17431/v1/chat/conversations/{cid}", headers=headers
            )
            assert response.status_code == 200 and response.json()["lastSequence"] == 0
    finally:
        if stopped:
            subprocess.run(
                ["docker", "start", "supabase_db_foc-chat-service"],
                check=True,
                stdout=subprocess.DEVNULL,
            )
