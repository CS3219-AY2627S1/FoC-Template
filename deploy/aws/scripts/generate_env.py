# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-02, 2026-11-03
# Scope: Implemented cloud environment and private credential-file generation.
# Author review: I validated correctness and added boundary checks where needed.

"""Generate fresh EC2 sandbox secrets once; never overwrite existing configuration."""

from __future__ import annotations

import argparse
import json
import os
import secrets
import subprocess
import tempfile
from pathlib import Path

from cloud_config import DATABASES, ROOT, validate_origin


def private_file(path: Path, content: str | bytes) -> None:
    data = content.encode() if isinstance(content, str) else content
    with path.open("xb") as stream:
        os.chmod(path, 0o600)
        stream.write(data)


def generate_keys(directory: Path) -> None:
    private = subprocess.run(
        ["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:3072"],
        check=True,
        capture_output=True,
    ).stdout
    public = subprocess.run(
        ["openssl", "pkey", "-pubout"],
        input=private,
        check=True,
        capture_output=True,
    ).stdout
    private_file(directory / "jwt_private_key.pem", private)
    private_file(directory / "jwt_public_key.pem", public)


def generate(root: Path, origin: str, uid: int, gid: int, key_generator=generate_keys) -> None:
    origin = validate_origin(origin)
    if uid <= 0 or gid <= 0:
        raise ValueError("Run as the non-root EC2 session user, without sudo.")
    if (root / ".env").exists() or (root / "secrets").exists():
        raise ValueError(
            "Cloud .env or secrets already exist. Preserve them; no automatic rotation."
        )
    root.mkdir(parents=True, exist_ok=True)
    credentials = {
        name: {"admin_password": secrets.token_hex(32), "runtime_password": secrets.token_hex(32)}
        for name in DATABASES
    }
    values = {
        "FOC_USER_UID": str(uid),
        "FOC_USER_GID": str(gid),
        "FOC_PUBLIC_ORIGIN": origin,
    }
    for name, (port, _, _) in DATABASES.items():
        scheme = "postgresql+asyncpg" if name in {"user", "chat"} else "postgresql"
        password = credentials[name]["runtime_password"]
        values[f"{name.upper()}_DATABASE_URL"] = (
            f"{scheme}://foc_{name}_runtime:{password}@host.docker.internal:{port}/postgres"
        )
    for key in (
        "OTP_HMAC_SECRET",
        "SUPPLIER_SERVICE_SHARED_SECRET",
        "CHAT_SERVICE_SHARED_SECRET",
        "ORDER_CREDIT_SHARED_SECRET",
        "ORDER_ADMIN_SHARED_SECRET",
        "RABBITMQ_PASSWORD",
    ):
        values[key] = secrets.token_hex(32)
    values.update(
        RABBITMQ_USER="foc_cloud",
        OPENAI_API_KEY="",
        OTP_EMAIL_PROVIDER="smtp",
        SES_REGION="ap-southeast-1",
        SES_FROM_ADDRESS="",
    )
    # Stage the entire key set before exposing an environment file that references it.
    with tempfile.TemporaryDirectory(prefix=".provision-", dir=root) as temporary:
        staging = Path(temporary)
        secret_dir = staging / "secrets"
        (secret_dir / "user").mkdir(parents=True, mode=0o700)
        os.chmod(secret_dir, 0o700)
        key_generator(secret_dir / "user")
        private_file(secret_dir / "database-admin.json", json.dumps(credentials, indent=2) + "\n")
        environment = "# EC2 sandbox only. Never commit, print or copy into a browser.\n"
        environment += "".join(f"{key}='{value}'\n" for key, value in values.items())
        private_file(staging / ".env", environment)
        secret_dir.rename(root / "secrets")
        (staging / ".env").rename(root / ".env")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="http://localhost:3000")
    args = parser.parse_args()
    try:
        if os.name != "posix":
            raise ValueError("Generate cloud secrets on the Linux EC2 server.")
        generate(ROOT, args.origin, os.getuid(), os.getgid())
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        if isinstance(error, ValueError):
            raise SystemExit(str(error)) from None
        raise SystemExit("Secret generation failed; no secret values were printed.") from None
    print("Created private cloud .env and secrets. Existing laptop settings were not read.")


if __name__ == "__main__":
    main()
