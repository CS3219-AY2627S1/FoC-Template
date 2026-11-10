# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-02
# Scope: Implemented deployment metadata and configuration parsing/validation helpers.
# Author review: I validated correctness and added boundary checks where needed.

"""Sandbox deployment metadata; no application business logic or schema history."""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = ROOT.parents[1]
DATABASES = {
    "user": (15422, "user_service", "user_service_app"),
    "supplier": (55322, "supplier_service", None),
    "order": (16422, "order_service", "order_service_app"),
    "credit": (16522, "credit_service", "credit_service_app"),
    "chat": (17422, "chat_service", "chat_runtime"),
    "admin": (17522, "admin_service", "admin_service_app"),
}
PROJECT_IDS = {service: f"{service}-service" for service in DATABASES}
PROJECT_IDS["chat"] = "foc-chat-service"


def validate_origin(value: str) -> str:
    if any(character.isspace() or ord(character) < 32 for character in value):
        raise ValueError("Browser origin must not contain whitespace or control characters.")
    parsed = urlsplit(value)
    local = parsed.hostname in {"localhost", "127.0.0.1"}
    if (
        not parsed.hostname
        or not re.fullmatch(r"[A-Za-z0-9.-]+", parsed.hostname)
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
        or (parsed.scheme != "https" and not (local and parsed.scheme == "http"))
    ):
        raise ValueError("Use an HTTPS browser origin, or HTTP localhost for the private tunnel.")
    # Force validation of a malformed port as well.
    _ = parsed.port
    return value.rstrip("/")


def read_environment(path: Path) -> dict[str, str]:
    """Read the deliberately simple generated format, without evaluating shell code."""
    result = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            raise ValueError("Invalid cloud environment entry.")
        if value.startswith("'") and value.endswith("'"):
            value = value[1:-1]
        result[key] = value
    return result


def load_database_secrets(root: Path = ROOT) -> dict:
    state = json.loads((root / "secrets/database-admin.json").read_text(encoding="utf-8"))
    if set(state) != set(DATABASES):
        raise ValueError("Database secret inventory must match all six owned services.")
    for credentials in state.values():
        for key in ("admin_password", "runtime_password"):
            if not re.fullmatch(r"[a-f0-9]{64}", credentials[key]):
                raise ValueError("Invalid generated database secret format.")
    return state
