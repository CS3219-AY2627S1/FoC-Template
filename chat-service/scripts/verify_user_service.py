# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented live checks against the User Service integration.
# Author review: I validated correctness and added boundary checks where needed.

"""Production HTTP-client smoke against User Service's owner-provisioned disposable demo.

Read credentials in memory only. Never provision/reset User Service data or copy signing keys.
"""

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID, uuid4

import httpx
from sqlalchemy.engine import make_url
from websockets.asyncio.client import connect

from app.config import Settings
from app.identity import IdentityClient


async def receive(ws, kind):
    async with asyncio.timeout(15):
        while True:
            frame = json.loads(await ws.recv())
            if frame["type"] == kind:
                return frame


async def verify(fixture_path):
    fixture = json.loads(Path(fixture_path).read_text(encoding="utf-8-sig"))
    base = fixture["userServiceBaseUrl"]
    if urlsplit(base).hostname not in {"127.0.0.1", "localhost"}:
        raise ValueError("Use only an owner-provisioned local User Service demo")
    database_url = os.environ["CHAT_TEST_DATABASE_URL"]
    url = make_url(database_url)
    if url.host not in {"127.0.0.1", "localhost"} or url.port != 17422:
        raise ValueError("Use only the isolated Chat Service database")
    settings = Settings(
        _env_file=None,
        user_service_base_url=base,
        chat_service_shared_secret=fixture["chatServiceSharedSecret"],
    )
    identity = IdentityClient(settings)
    timings = {}
    try:
        started = time.perf_counter()
        caller = await identity.authenticate(fixture["callerAccessToken"])
        counterpart = await identity.authenticate(fixture["counterpartAccessToken"])
        assert str(caller.user_id) == fixture["callerUserId"]
        assert str(counterpart.user_id) == fixture["counterpartUserId"]
        timings["identityMs"] = round((time.perf_counter() - started) * 1000, 2)
        result = await identity.search(caller, {"username": fixture["usernameQuery"], "limit": 1})
        found = result["items"]
        while result["nextCursor"]:
            result = await identity.search(
                caller,
                {"username": fixture["usernameQuery"], "limit": 1, "cursor": result["nextCursor"]},
            )
            found.extend(result["items"])
        assert [item["userId"] for item in found] == [fixture["counterpartUserId"]]
        people = await identity.participants(
            [
                UUID(fixture[key])
                for key in ("callerUserId", "counterpartUserId", "deletedUserId", "unknownUserId")
            ]
        )
        assert people[counterpart.user_id]["displayName"] == "Renamed"
        assert people[UUID(fixture["deletedUserId"])]["displayName"] == "Deleted User"
        assert people[UUID(fixture["deletedUserId"])]["username"] is None
        assert UUID(fixture["unknownUserId"]) not in people
    finally:
        await identity.close()

    root = Path(__file__).resolve().parents[1]
    env = {
        **os.environ,
        "DATABASE_URL": database_url,
        "USER_SERVICE_BASE_URL": base,
        "CHAT_SERVICE_SHARED_SECRET": fixture["chatServiceSharedSecret"],
        "RABBITMQ_URL": os.environ["CHAT_TEST_RABBITMQ_URL"],
    }
    # Credentials stay in process environment; never command arguments or shell interpolation.
    child = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "17433",
            "--no-access-log",
            "--log-level",
            "critical",
        ],
        cwd=root,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    children = [child]
    for command in (
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "17434",
            "--no-access-log",
            "--log-level",
            "critical",
        ],
        [sys.executable, "-m", "app.outbox"],
    ):
        children.append(
            subprocess.Popen(
                command,
                cwd=root,
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
        )
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            async with asyncio.timeout(20):
                while True:
                    try:
                        for port in (17433, 17434):
                            response = await client.get(f"http://127.0.0.1:{port}/health/ready")
                            assert (
                                response.status_code == 200
                                and response.json()["delivery"] == "ready"
                            )
                        break
                    except (httpx.HTTPError, AssertionError):
                        await asyncio.sleep(0.2)
            headers = {"Authorization": f"Bearer {fixture['callerAccessToken']}"}
            r = await client.post(
                "http://127.0.0.1:17433/v1/chat/conversations",
                headers=headers,
                json={"recipientUserId": fixture["counterpartUserId"]},
            )
            assert r.status_code == 200
            cid = r.json()["conversationId"]
            r = await client.get(
                f"http://127.0.0.1:17433/v1/chat/conversations/{cid}", headers=headers
            )
            assert r.json()["counterpart"]["displayName"] == "Renamed"
            for key in ("deletedUserId", "unknownUserId"):
                r = await client.post(
                    "http://127.0.0.1:17433/v1/chat/conversations",
                    headers=headers,
                    json={"recipientUserId": fixture[key]},
                )
                assert r.status_code == 409
            async with (
                connect("ws://127.0.0.1:17433/v1/chat/ws", origin="http://localhost:3000") as ws,
                connect(
                    "ws://127.0.0.1:17434/v1/chat/ws", origin="http://localhost:3000"
                ) as recipient_ws,
            ):
                await ws.send(
                    json.dumps(
                        {"type": "authenticate", "accessToken": fixture["callerAccessToken"]}
                    )
                )
                await receive(ws, "ready")
                await recipient_ws.send(
                    json.dumps(
                        {"type": "authenticate", "accessToken": fixture["counterpartAccessToken"]}
                    )
                )
                await receive(recipient_ws, "ready")
                command = {
                    "type": "message.send",
                    "requestId": str(uuid4()),
                    "conversationId": cid,
                    "clientMessageId": str(uuid4()),
                    "text": "Real User Service integration smoke",
                }
                started = time.perf_counter()
                await ws.send(json.dumps(command))
                accepted = (await receive(ws, "message.accepted"))["message"]
                timings["acceptanceMs"] = round((time.perf_counter() - started) * 1000, 2)
                assert (await receive(recipient_ws, "message.created"))["message"] == accepted
                timings["deliveryMs"] = round((time.perf_counter() - started) * 1000, 2)
                await ws.send(json.dumps(command))
                assert (await receive(ws, "message.accepted"))["message"] == accepted
                started = time.perf_counter()
                r = await client.get(
                    f"http://127.0.0.1:17433/v1/chat/conversations/{cid}/messages",
                    headers={"Authorization": f"Bearer {fixture['counterpartAccessToken']}"},
                )
                assert accepted in r.json()["items"]
                timings["historyMs"] = round((time.perf_counter() - started) * 1000, 2)
    finally:
        for child in children:
            child.terminate()
        for child in children:
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)
    print(
        json.dumps(
            {
                "result": "passed",
                "checks": [
                    "RS256 JWKS/current session",
                    "search pagination",
                    "current names/tombstones/missing IDs",
                    "conversation authorization",
                    "WebSocket durable send",
                    "two-process RabbitMQ delivery",
                    "retry idempotency",
                    "recipient history",
                ],
                "baselineTimings": timings,
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", required=True)
    args = parser.parse_args()
    asyncio.run(verify(args.fixture))
