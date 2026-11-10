# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-02, 2026-11-03
# Scope: Implemented validation of rendered cloud deployment configuration.
# Author review: I validated correctness and added boundary checks where needed.

"""Render and check private or CloudFront cloud Compose without printing secrets."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from urllib.parse import urlsplit

from cloud_config import DATABASES, ROOT, validate_origin
from public_https import validate_public_origin


def validate(config: dict, *, public: bool = False) -> None:
    services = config["services"]
    expected = {
        "web-client",
        "user-service",
        "supplier-service",
        "order-service",
        "credit-service",
        "outbox-publisher",
        "order-recovery",
        "order-expiry",
        "order-outbox",
        "credit-consumer",
        "chat-service",
        "chat-outbox",
        "admin-service",
        "voice-assist-service",
        "mailpit",
        "rabbitmq",
    }
    if set(services) != expected:
        raise ValueError("Cloud service inventory is incomplete or unexpected.")
    for name, service in services.items():
        allowed = {
            "web-client": {("127.0.0.1", 3000, 80)},
            "mailpit": {("127.0.0.1", 8025, 8025)},
        }.get(name, set()).copy()
        if public and name == "web-client":
            allowed.add(("0.0.0.0", 8080, 8080))
        observed = []
        for port in service.get("ports", []):
            observed.append((port.get("host_ip"), int(port["published"]), int(port["target"])))
            if port.get("protocol", "tcp") != "tcp":
                raise ValueError("Cloud ingress bindings must use TCP.")
        if set(observed) != allowed or len(observed) != len(allowed):
            raise ValueError(
                "Cloud ports must match the selected private or CloudFront ingress mode."
            )
        if service.get("restart") != "unless-stopped":
            raise ValueError("Every cloud workload needs an explicit restart policy.")
        if service.get("logging", {}).get("options", {}).get("max-size") != "10m":
            raise ValueError("Every cloud workload needs bounded logs.")
    user = services["user-service"]["environment"]
    if user["ENVIRONMENT"] != "production":
        raise ValueError("User must retain production secure-cookie behavior.")
    email_provider = user.get("OTP_EMAIL_PROVIDER", "smtp")
    if email_provider not in {"smtp", "ses"}:
        raise ValueError("Select SMTP/Mailpit or SES explicitly for verification email.")
    if email_provider == "ses" and (not user.get("SES_REGION") or not user.get("SES_FROM_ADDRESS")):
        raise ValueError("SES verification email requires a region and verified sender address.")
    if any(
        key in user for key in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN")
    ):
        raise ValueError("Use the EC2 instance role for SES, not application AWS access keys.")
    for name, (port, _, _) in DATABASES.items():
        environment = services[f"{name}-service"]["environment"]
        key = "SUPPLIER_DATABASE_URL" if name == "supplier" else "DATABASE_URL"
        parsed = urlsplit(environment[key])
        if (
            parsed.hostname != "host.docker.internal"
            or parsed.port != port
            or parsed.username != f"foc_{name}_runtime"
            or not parsed.password
            or parsed.password == "REPLACE"
        ):
            raise ValueError(f"{name}: use its own generated restricted EC2 database login.")
    if "DATABASE_URL" in services["voice-assist-service"]["environment"]:
        raise ValueError("Voice must remain stateless.")
    if services["voice-assist-service"]["environment"]["VOICE_ASSIST_PROVIDER"] != "openai":
        raise ValueError("Cloud voice must never select a fake provider.")
    if (
        services["order-service"]["environment"]["CREDIT_SERVICE_SECRET"]
        != (services["credit-service"]["environment"]["ORDER_SERVICE_SECRET"])
    ):
        raise ValueError("Order and Credit credentials must agree.")
    if (
        services["order-service"]["environment"]["ADMIN_SERVICE_SECRET"]
        != services["admin-service"]["environment"]["ORDER_SERVICE_SECRET"]
    ):
        raise ValueError("Order and Admin credentials must agree.")
    for peer, key in (
        ("supplier-service", "SUPPLIER_SERVICE_SHARED_SECRET"),
        ("chat-service", "CHAT_SERVICE_SHARED_SECRET"),
    ):
        if user[key] != services[peer]["environment"][key]:
            raise ValueError("User and peer service credentials must agree.")
    secrets = [
        user[key]
        for key in (
            "OTP_HMAC_SECRET",
            "SUPPLIER_SERVICE_SHARED_SECRET",
            "CHAT_SERVICE_SHARED_SECRET",
        )
    ]
    secrets += [
        services["credit-service"]["environment"]["ORDER_SERVICE_SECRET"],
        services["admin-service"]["environment"]["ORDER_SERVICE_SECRET"],
        services["rabbitmq"]["environment"]["RABBITMQ_DEFAULT_PASS"],
    ]
    if any(not value or value == "REPLACE" for value in secrets) or len(set(secrets)) != len(
        secrets
    ):
        raise ValueError(
            "Use distinct generated secrets rather than placeholders or reused identities."
        )
    chat_origin = json.loads(services["chat-service"]["environment"]["ALLOWED_ORIGINS"])
    if len(chat_origin) != 1:
        raise ValueError("Set the exact cloud browser origin.")
    validate_origin(chat_origin[0])
    if public:
        validate_public_origin(chat_origin[0])
        if not any(
            mount.get("target") == "/etc/nginx/foc-public"
            and mount.get("type") == "bind"
            and mount.get("read_only") is True
            for mount in services["web-client"].get("volumes", [])
        ):
            raise ValueError("Public ingress needs its read-only Nginx listener configuration.")
    for worker, owner in (
        ("outbox-publisher", "user-service"),
        ("order-recovery", "order-service"),
        ("order-expiry", "order-service"),
        ("order-outbox", "order-service"),
        ("credit-consumer", "credit-service"),
        ("chat-outbox", "chat-service"),
    ):
        if (
            services[worker]["environment"]["DATABASE_URL"]
            != services[owner]["environment"]["DATABASE_URL"]
        ):
            raise ValueError("A worker must use only its owning service's database.")
    broker = services["rabbitmq"]
    if not broker.get("hostname") or not any(
        mount.get("type") == "volume" for mount in broker.get("volumes", [])
    ):
        raise ValueError("RabbitMQ needs a stable hostname and persistent volume.")
    for name in ("user-service", "outbox-publisher"):
        if services[name]["user"].split(":")[0] == "0":
            raise ValueError("User containers must run as the private key's non-root owner.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public", action="store_true", help="Validate the CloudFront overlay.")
    args = parser.parse_args()
    prefix = ["sudo", "docker"] if os.name == "posix" and os.getuid() != 0 else ["docker"]
    files = ["-f", str(ROOT / "compose.yaml")]
    if args.public:
        files += ["-f", str(ROOT / "compose.public.yaml")]
    try:
        result = subprocess.run(
            [
                *prefix,
                "compose",
                "--env-file",
                str(ROOT / ".env"),
                *files,
                "--profile",
                "*",
                "config",
                "--format",
                "json",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise ValueError(
                "Compose rendering failed. Check .env and file paths privately; output suppressed."
            )
        validate(json.loads(result.stdout), public=args.public)
    except (ValueError, OSError, KeyError, TypeError) as error:
        if isinstance(error, ValueError) and not isinstance(error, json.JSONDecodeError):
            raise SystemExit(str(error)) from None
        raise SystemExit(
            "Cloud config validation failed; output suppressed to protect secrets."
        ) from None
    mode = "CloudFront overlay (verify EC2 firewall separately)" if args.public else "private ports"
    print(
        f"PASS: cloud inventory, {mode}, owned databases, matched secrets, workers and broker persistence."
    )


if __name__ == "__main__":
    main()
