#!/usr/bin/env python3
# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented the local Chat identity contract demonstration.
# Author review: I validated correctness and added boundary checks where needed.

"""Demonstrate real HTTP contracts with disposable accounts and in-memory RSA keys."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import secrets
import socket
from datetime import datetime
from statistics import median
from time import perf_counter
from uuid import uuid4

import httpx
import uvicorn
from cryptography.hazmat.primitives.asymmetric import rsa
from run_chat_tests import PROJECT_ROOT, isolated_database_url
from sqlalchemy import func, select

from app.auth.jwt import JwtKeyStore
from app.auth.service import AuthenticationService
from app.core.config import Settings
from app.core.logging import logger
from app.db import Database
from app.main import create_app
from app.models import User


class QueryTimingCollector(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.samples: list[float] = []

    def emit(self, record: logging.LogRecord) -> None:
        context = getattr(record, "context", {})
        if "queryDurationMs" in context:
            self.samples.append(context["queryDurationMs"])


class DemoOtpSender:
    def __init__(self) -> None:
        self.codes: dict[str, str] = {}

    async def send_verification_code(self, *, recipient: str, otp: str, expires_at: datetime):
        self.codes[recipient] = otp


async def demonstrate(*, serve: bool, port: int) -> None:
    # Discovery verifies the project ID, loopback host/port, and absence of cloud link state.
    database = Database(isolated_database_url())
    secret = secrets.token_urlsafe(48)
    password = secrets.token_urlsafe(18) + "Aa1!"
    settings = Settings(
        _env_file=None,
        environment="test",
        log_level="WARNING",
        database_url=None,
        chat_service_shared_secret=secret,
        jwt_private_key_path=None,
        jwt_public_key_path=None,
        otp_hmac_secret=secrets.token_urlsafe(48),
        bcrypt_rounds=4,
        jwt_access_token_ttl_seconds=3600,
    )
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    key_store = JwtKeyStore(settings, private_key=private_key, public_key=private_key.public_key())
    sender = DemoOtpSender()
    app = create_app(
        settings=settings,
        database=database,
        otp_sender=sender,
        authentication_service=AuthenticationService(settings, key_store),
    )
    query_timings = QueryTimingCollector()
    for handler in logger.handlers:
        handler.setLevel(logging.WARNING)
    logger.addHandler(query_timings)
    logger.setLevel(logging.INFO)
    server = uvicorn.Server(uvicorn.Config(app, log_level="warning", access_log=False))
    listener = socket.socket()
    listener.bind(("127.0.0.1", port))
    listener.listen(128)
    actual_port = listener.getsockname()[1]
    base_url = f"http://127.0.0.1:{actual_port}"
    server_task = asyncio.create_task(server.serve(sockets=[listener]))
    fixture_path = None
    try:
        for _ in range(200):
            if server.started:
                break
            if server_task.done():
                await server_task
                raise RuntimeError("Demo server stopped before startup.")
            await asyncio.sleep(0.05)
        if not server.started:
            raise RuntimeError("Demo server startup timed out.")
        async with httpx.AsyncClient(base_url=base_url, timeout=5, trust_env=False) as client:
            run_id = uuid4().hex[:12]
            query = "chat" + run_id

            async def create_account(suffix: str) -> tuple[str, str, str]:
                username = query + "-" + suffix
                email = username + "@u.nus.edu"
                pending = await client.post(
                    "/v1/auth/registrations",
                    json={
                        "username": username,
                        "email": email,
                        "displayName": "Alex",
                        "password": password,
                    },
                )
                assert pending.status_code == 202
                verified = await client.post(
                    "/v1/auth/email-verifications",
                    json={
                        "email": email,
                        "otp": sender.codes.pop(email),
                    },
                )
                assert verified.status_code == 201
                login = await client.post(
                    "/v1/auth/sessions", json={"email": email, "password": password}
                )
                assert login.status_code == 200
                return verified.json()["userId"], login.json()["accessToken"], username

            caller, caller_token, _ = await create_account("caller")
            counterpart, counterpart_token, counterpart_username = await create_account(
                "counterpart"
            )
            deleted, deleted_token, _ = await create_account("deleted")
            removed = await client.request(
                "DELETE",
                "/v1/users/me",
                headers={
                    "Authorization": "Bearer " + deleted_token,
                },
                json={"currentPassword": password, "acknowledgeDeletion": True},
            )
            assert removed.status_code == 204
            unknown = str(uuid4())
            service_headers = {"X-FoC-Service-Secret": secret}
            search_headers = {**service_headers, "Authorization": "Bearer " + caller_token}
            search = await client.get(
                "/v1/internal/chat/users",
                headers=search_headers,
                params={"username": query, "limit": 20},
            )
            assert search.status_code == 200
            assert search.json() == {
                "items": [{"userId": counterpart, "username": counterpart_username}],
                "nextCursor": None,
            }
            body = {"userIds": [counterpart, deleted, unknown]}
            initial = await client.post(
                "/v1/internal/chat/participants", headers=service_headers, json=body
            )
            assert initial.status_code == 200
            assert initial.json()["items"][0]["displayName"] == "Alex"
            edited = await client.patch(
                "/v1/users/me",
                headers={
                    "Authorization": "Bearer " + counterpart_token,
                },
                json={"displayName": "Renamed"},
            )
            assert edited.status_code == 200
            current = await client.post(
                "/v1/internal/chat/participants", headers=service_headers, json=body
            )
            assert current.status_code == 200
            assert current.json()["items"][0]["displayName"] == "Renamed"
            assert current.json()["items"][1] == {
                "userId": deleted,
                "displayName": "Deleted User",
                "username": None,
                "accountStatus": "DELETED",
            }
            assert current.json()["missingUserIds"] == [unknown]
            print("Real HTTP search: " + json.dumps(search.json()), flush=True)
            print(
                "Real HTTP participant lookup after profile edit: " + json.dumps(current.json()),
                flush=True,
            )
            timings = {}
            async for session in database.session():
                dataset_users = await session.scalar(select(func.count()).select_from(User))
            for label, size in (
                ("search-limit-20", None),
                ("participants-1", 1),
                ("participants-3", 3),
                ("participants-100", 100),
            ):
                samples = []
                query_timings.samples.clear()
                batch = [counterpart, deleted, unknown] + [str(uuid4()) for _ in range(97)]
                for _ in range(10):
                    started_at = perf_counter()
                    if size is None:
                        response = await client.get(
                            "/v1/internal/chat/users",
                            headers=search_headers,
                            params={"username": query, "limit": 20},
                        )
                    else:
                        response = await client.post(
                            "/v1/internal/chat/participants",
                            headers=service_headers,
                            json={"userIds": batch[:size]},
                        )
                    assert response.status_code == 200
                    assert response.headers["Cache-Control"] == "no-store"
                    samples.append((perf_counter() - started_at) * 1000)
                timings[label] = {
                    "requests": 10,
                    "minMs": round(min(samples), 3),
                    "medianMs": round(median(samples), 3),
                    "maxMs": round(max(samples), 3),
                    "medianQueryMs": round(median(query_timings.samples), 3),
                }
            print(f"Baseline database population: {dataset_users} user rows.", flush=True)
            print(
                "Local HTTP baseline (not load certification): " + json.dumps(timings), flush=True
            )
            if serve:
                # Disposable local credentials only. Never persist private RSA material.
                fixture_path = PROJECT_ROOT / f"demo-{run_id}.json"
                with fixture_path.open("x", encoding="utf-8") as fixture:
                    json.dump(
                        {
                            "userServiceBaseUrl": base_url,
                            "chatServiceSharedSecret": secret,
                            "callerAccessToken": caller_token,
                            "callerUserId": caller,
                            "counterpartAccessToken": counterpart_token,
                            "counterpartUserId": counterpart,
                            "counterpartUsername": counterpart_username,
                            "deletedUserId": deleted,
                            "unknownUserId": unknown,
                            "usernameQuery": query,
                        },
                        fixture,
                    )
                print(
                    f"Disposable integration fixture (credentials withheld): {fixture_path}",
                    flush=True,
                )
                print(f"User Service demo is listening at {base_url}; Ctrl+C stops it.", flush=True)
                await server_task
    finally:
        if fixture_path is not None:
            fixture_path.unlink(missing_ok=True)
        server.should_exit = True
        await server_task
        listener.close()
        logger.removeHandler(query_timings)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--serve", action="store_true", help="Keep running for a Chat Service smoke check"
    )
    parser.add_argument(
        "--port", type=int, default=18080, help="Loopback port; 0 selects a free port"
    )
    arguments = parser.parse_args()
    asyncio.run(demonstrate(serve=arguments.serve, port=arguments.port))


if __name__ == "__main__":
    main()
