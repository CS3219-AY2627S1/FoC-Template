#!/usr/bin/env python3
# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21, 2026-09-22, 2026-09-30
# Scope: Implemented the registration and event demo and updated its profile and bootstrap
# checks.
# Author review: I validated correctness and added boundary checks where needed.

"""Run the local D2 User Service demonstration without printing secrets.

Start Supabase and ``docker compose up --build`` first. Configure the initial
Super Admin in the ignored .env file, then set D2_DEMO_NORMAL_PASSWORD in the
terminal that runs this script. Usernames and email addresses can be adjusted
through the non-secret command-line options.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
from dataclasses import dataclass
from typing import Any

import httpx

from app.admin.bootstrap import bootstrap_from_settings
from app.core.config import Settings, get_settings
from app.outbox.events import USER_REGISTERED_EVENT_TYPE


@dataclass
class EventCapture:
    connection: Any
    queue: Any

    async def receive_payload(self, *, expected_user_id: str) -> dict[str, str]:
        async with asyncio.timeout(15):
            async with self.queue.iterator() as iterator:
                async for message in iterator:
                    async with message.process():
                        payload = json.loads(message.body)
                    expected_fields = {"eventId", "eventType", "userId", "occurredAt"}
                    if (
                        set(payload) == expected_fields
                        and payload["eventType"] == USER_REGISTERED_EVENT_TYPE
                        and payload["userId"] == expected_user_id
                    ):
                        return payload
                else:
                    raise RuntimeError("RabbitMQ did not deliver the registration event.")
        raise RuntimeError("RabbitMQ did not deliver the expected registration event.")

    async def close(self) -> None:
        await self.connection.close()


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--mailpit-url", default="http://localhost:8025")
    parser.add_argument("--username", default="d2-demo-user")
    parser.add_argument("--email", default="d2-demo-user@u.nus.edu")
    parser.add_argument("--display-name", default="D2-Demo-User")
    parser.add_argument("--password-env", default="D2_DEMO_NORMAL_PASSWORD")
    return parser.parse_args()


async def capture_registration_event(settings: Settings) -> EventCapture:
    rabbitmq_url = settings.rabbitmq_url
    if rabbitmq_url is None:
        raise RuntimeError("RABBITMQ_URL must be configured for the D2 demo.")
    import aio_pika

    connection = await aio_pika.connect_robust(rabbitmq_url.get_secret_value())
    channel = await connection.channel()
    exchange = await channel.declare_exchange(
        settings.outbox_exchange_name,
        aio_pika.ExchangeType.TOPIC,
        durable=True,
    )
    queue = await channel.declare_queue("", exclusive=True, auto_delete=True)
    await queue.bind(exchange, routing_key=USER_REGISTERED_EVENT_TYPE)
    return EventCapture(connection=connection, queue=queue)


async def mailpit_otp(client: httpx.AsyncClient, email: str) -> str:
    messages = (await client.get("/api/v1/messages", params={"limit": 50})).json()["messages"]
    for summary in messages:
        recipients = json.dumps(summary.get("To", []))
        if email.casefold() not in recipients.casefold():
            continue
        message_id = summary.get("ID")
        if not message_id:
            continue
        details = (await client.get(f"/api/v1/message/{message_id}")).json()
        match = re.search(r"\b\d{6}\b", json.dumps(details))
        if match:
            return match.group(0)
    raise RuntimeError("Mailpit did not return the expected verification message.")


def bearer_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


async def assert_status(response: httpx.Response, expected: int, action: str) -> dict[str, Any]:
    if response.status_code != expected:
        raise RuntimeError(f"{action} returned HTTP {response.status_code}.")
    return response.json() if response.content else {}


async def run_demo(arguments: argparse.Namespace) -> None:
    normal_password = os.getenv(arguments.password_env)
    if not normal_password:
        raise RuntimeError(f"Set {arguments.password_env} before running the D2 demo.")
    settings = get_settings()
    if (
        settings.bootstrap_super_admin_email is None
        or settings.bootstrap_super_admin_password is None
    ):
        raise RuntimeError("Configure bootstrap Super Admin credentials in the ignored .env file.")

    await bootstrap_from_settings(settings)
    event_capture = await capture_registration_event(settings)
    try:
        async with httpx.AsyncClient(base_url=arguments.base_url, timeout=20) as service_client:
            async with httpx.AsyncClient(
                base_url=arguments.mailpit_url,
                timeout=20,
            ) as mailpit_client:
                registration = await service_client.post(
                    "/v1/auth/registrations",
                    json={
                        "username": arguments.username,
                        "email": arguments.email,
                        "displayName": arguments.display_name,
                        "password": normal_password,
                    },
                )
                await assert_status(registration, 202, "registration")
                otp = await mailpit_otp(mailpit_client, arguments.email)
                verified = await assert_status(
                    await service_client.post(
                        "/v1/auth/email-verifications",
                        json={"email": arguments.email, "otp": otp},
                    ),
                    201,
                    "email verification",
                )
                await event_capture.receive_payload(expected_user_id=verified["userId"])

                user_login = await assert_status(
                    await service_client.post(
                        "/v1/auth/sessions",
                        json={"email": arguments.email, "password": normal_password},
                    ),
                    200,
                    "normal-user login",
                )
                user_headers = bearer_headers(user_login["accessToken"])
                protected = await service_client.patch(
                    "/v1/users/me",
                    headers=user_headers,
                    json={"systemRole": "SUPER_ADMIN"},
                )
                if protected.status_code != 422:
                    raise RuntimeError("The protected-profile-field check did not fail.")

                service_secret = settings.supplier_service_shared_secret
                if service_secret is None:
                    raise RuntimeError(
                        "SUPPLIER_SERVICE_SHARED_SECRET must be configured for the D2 demo."
                    )
                decision_headers = {
                    **user_headers,
                    "X-FoC-Service-Secret": service_secret.get_secret_value(),
                }
                denied = await assert_status(
                    await service_client.post(
                        "/v1/internal/authorization-decisions",
                        headers=decision_headers,
                        json={"action": "SUPPLIER_CREATE"},
                    ),
                    200,
                    "User supplier decision",
                )
                if denied["allowed"]:
                    raise RuntimeError(
                        "A normal User unexpectedly received supplier authorization."
                    )

                admin_login = await assert_status(
                    await service_client.post(
                        "/v1/auth/sessions",
                        json={
                            "email": settings.bootstrap_super_admin_email,
                            "password": settings.bootstrap_super_admin_password.get_secret_value(),
                        },
                    ),
                    200,
                    "Super Admin login",
                )
                await assert_status(
                    await service_client.patch(
                        f"/v1/admin/users/{verified['userId']}/system-role",
                        headers=bearer_headers(admin_login["accessToken"]),
                        json={"systemRole": "ADMIN"},
                    ),
                    200,
                    "Admin promotion",
                )

                admin_user_login = await assert_status(
                    await service_client.post(
                        "/v1/auth/sessions",
                        json={"email": arguments.email, "password": normal_password},
                    ),
                    200,
                    "promoted Admin login",
                )
                allowed = await assert_status(
                    await service_client.post(
                        "/v1/internal/authorization-decisions",
                        headers={
                            **bearer_headers(admin_user_login["accessToken"]),
                            "X-FoC-Service-Secret": service_secret.get_secret_value(),
                        },
                        json={"action": "SUPPLIER_CREATE"},
                    ),
                    200,
                    "Admin supplier decision",
                )
                if not allowed["allowed"]:
                    raise RuntimeError("The promoted Admin did not receive supplier authorization.")
    finally:
        await event_capture.close()

    print(
        "D2 demo passed: safe registration event, verified registration, login, profile "
        "protection, "
        "role promotion, and Supplier authorization transition."
    )


def main() -> None:
    try:
        asyncio.run(run_demo(parse_arguments()))
    except RuntimeError as error:
        raise SystemExit(f"D2 demo failed: {error}") from error
    except Exception as error:
        raise SystemExit(f"D2 demo failed: {type(error).__name__}") from error


if __name__ == "__main__":
    main()
