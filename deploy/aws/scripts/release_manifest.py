# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-06
# Scope: Implemented release manifest validation and canonical file fingerprinting.
# Author review: I validated correctness and added boundary checks where needed.

"""Validate immutable application releases without reading environment files or secrets."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from cloud_config import DATABASES, REPOSITORY
from release_migrations import POLICY, read_policy

ARTIFACTS = (
    "web-client",
    "user-service",
    "supplier-service",
    "order-service",
    "credit-service",
    "chat-service",
    "admin-service",
    "voice-assist-service",
)
GROUPS = {
    "web-client": ("web-client",),
    "user-service": ("user-service", "outbox-publisher"),
    "supplier-service": ("supplier-service",),
    "order-service": ("order-service", "order-recovery", "order-expiry", "order-outbox"),
    "credit-service": ("credit-service", "credit-consumer"),
    "chat-service": ("chat-service", "chat-outbox"),
    "admin-service": ("admin-service",),
    "voice-assist-service": ("voice-assist-service",),
}
APPLICATIONS = tuple(name for group in GROUPS.values() for name in group)
SHA = re.compile(r"[a-f0-9]{40}")
DIGEST = re.compile(r"sha256:[a-f0-9]{64}")


def checksum(path: Path) -> str:
    """Git checkouts may use CRLF locally; deployment contracts use canonical LF."""
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def configuration(repo: Path = REPOSITORY) -> dict[str, str]:
    root = repo / "deploy/aws"
    files = [root / "compose.yaml", root / "compose.public.yaml"]
    for directory in ("nginx", "nginx-public"):
        files.extend(sorted((root / directory).glob("*.conf")))
    if any(not path.is_file() for path in files):
        raise ValueError("Deployment configuration is incomplete.")
    return {path.relative_to(repo).as_posix(): checksum(path) for path in files}


def migrations(repo: Path = REPOSITORY) -> dict[str, dict[str, str]]:
    history = {}
    for service in DATABASES:
        paths = sorted((repo / f"{service}-service/supabase/migrations").glob("*.sql"))
        if not paths:
            raise ValueError(f"{service}: canonical migration history is missing.")
        history[service] = {path.name: checksum(path) for path in paths}
    return history


def validate_manifest(value: object) -> dict:
    if not isinstance(value, dict) or set(value) != {
        "version",
        "release_id",
        "commit",
        "account_id",
        "region",
        "images",
        "configuration",
        "migrations",
        "migration_policy",
    }:
        raise ValueError("Unexpected release manifest fields.")
    if (
        type(value["version"]) is not int
        or value["version"] != 2
        or not isinstance(value["commit"], str)
        or not SHA.fullmatch(value["commit"])
    ):
        raise ValueError("Release must identify one full Git commit.")
    if (
        not isinstance(value["release_id"], str)
        or not re.fullmatch(r"[a-f0-9]{12}-[0-9]{1,20}-[0-9]{1,6}", value["release_id"])
        or not value["release_id"].startswith(value["commit"][:12] + "-")
    ):
        raise ValueError("Invalid release identity.")
    account = value["account_id"]
    if not isinstance(account, str) or not re.fullmatch(r"[0-9]{12}", account):
        raise ValueError("Invalid release account.")
    if value["region"] != "ap-southeast-1":
        raise ValueError("This deployment supports only the existing Singapore environment.")
    images = value["images"]
    if not isinstance(images, dict) or set(images) != set(ARTIFACTS):
        raise ValueError("Release must contain all eight application images.")
    registry = f"{account}.dkr.ecr.ap-southeast-1.amazonaws.com"
    for artifact in ARTIFACTS:
        prefix = f"{registry}/foc/{artifact}@"
        image = images[artifact]
        if (
            not isinstance(image, str)
            or not image.startswith(prefix)
            or not DIGEST.fullmatch(image[len(prefix) :])
        ):
            raise ValueError("Use exact application repository names and immutable ECR digests.")
    config = value["configuration"]
    expected = set(configuration())
    if not isinstance(config, dict) or set(config) != expected:
        raise ValueError("Unexpected deployment configuration inventory.")
    hashes = [*config.values(), value["migration_policy"]]
    schema = value["migrations"]
    if not isinstance(schema, dict) or set(schema) != set(DATABASES):
        raise ValueError("Unexpected migration inventory.")
    for service, entries in schema.items():
        if not isinstance(entries, dict) or not entries:
            raise ValueError(f"{service}: migration history is missing.")
        for name, digest in entries.items():
            if not isinstance(name, str) or not re.fullmatch(r"[0-9]{14}_[A-Za-z0-9_]+\.sql", name):
                raise ValueError("Invalid migration filename.")
            hashes.append(digest)
    if any(
        not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest)
        for digest in hashes
    ):
        raise ValueError("Invalid release checksums.")
    return value


def compose_images(images: dict[str, str]) -> dict:
    return {
        "services": {
            service: {"image": images[artifact]}
            for artifact, services in GROUPS.items()
            for service in services
        }
    }


def create_manifest(
    repo: Path, digests: Path, commit: str, account: str, run: str, attempt: str
) -> dict:
    read_policy(repo)
    images = {}
    for artifact in ARTIFACTS:
        value = json.loads((digests / f"{artifact}.json").read_text(encoding="utf-8"))
        if set(value) != {"artifact", "digest"} or value["artifact"] != artifact:
            raise ValueError("Unexpected build result.")
        images[artifact] = (
            f"{account}.dkr.ecr.ap-southeast-1.amazonaws.com/foc/{artifact}@{value['digest']}"
        )
    return validate_manifest(
        {
            "version": 2,
            "release_id": f"{commit[:12]}-{run}-{attempt}",
            "commit": commit,
            "account_id": account,
            "region": "ap-southeast-1",
            "images": images,
            "configuration": configuration(repo),
            "migrations": migrations(repo),
            "migration_policy": checksum(repo / POLICY),
        }
    )
