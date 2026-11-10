# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-08
# Scope: Implemented collector identity checks, configuration writes and timer installation.
# Author review: I validated correctness and added boundary checks where needed.

"""Install only the FoC monitoring timer; preserve application containers, data and secrets."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path

from cloud_config import REPOSITORY
from monitor_runtime import STATE, MonitoringError, execute, validate_config


def identity_matches(config: dict, identity: dict) -> bool:
    return (
        identity.get("Account") == config["account_id"]
        and str(identity.get("Arn", "")).startswith(
            f"arn:aws:sts::{config['account_id']}:assumed-role/"
        )
        and str(identity.get("Arn", "")).endswith("/" + config["instance_id"])
    )


def write_file(path: Path, content: str, mode: int) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix=".monitoring-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            os.chmod(temporary, mode)
            stream.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def install(config: dict) -> None:
    validate_config(config)
    if os.name != "posix" or os.getuid() != 0 or REPOSITORY != Path("/opt/foc"):
        raise MonitoringError("Run the installer with sudo on the existing /opt/foc EC2 host.")
    identity = json.loads(
        execute(
            [
                "aws",
                "sts",
                "get-caller-identity",
                "--region",
                config["region"],
                "--output",
                "json",
                "--no-cli-pager",
            ]
        )
    )
    if not identity_matches(config, identity):
        raise MonitoringError("Instance-role identity does not match the monitoring target.")
    if STATE.is_symlink() or (STATE.exists() and (not STATE.is_dir() or STATE.stat().st_uid != 0)):
        raise MonitoringError("Monitoring state must be a root-owned directory, not a symlink.")
    STATE.mkdir(mode=0o700, exist_ok=True)
    os.chmod(STATE, 0o700)
    path = STATE / "config.json"
    if path.is_symlink():
        raise MonitoringError("Monitoring configuration must not be a symlink.")
    if path.exists() and validate_config(json.loads(path.read_text())) != config:
        raise MonitoringError(
            "Existing monitoring target differs; review it before changing configuration."
        )
    write_file(path, json.dumps(config, indent=2) + "\n", 0o600)
    source = REPOSITORY / "deploy/aws/systemd"
    for name in ("foc-monitoring.service", "foc-monitoring.timer"):
        write_file(Path("/etc/systemd/system") / name, (source / name).read_text(), 0o644)
    execute(["systemctl", "daemon-reload"])
    execute(["systemctl", "enable", "--now", "foc-monitoring.timer"])
    print(
        "Installed foc-monitoring.timer. No application container or environment file was changed."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--account-id", required=True)
    parser.add_argument("--instance-id", required=True)
    parser.add_argument("--public-origin", required=True)
    args = parser.parse_args()
    try:
        install(
            {
                "account_id": args.account_id,
                "instance_id": args.instance_id,
                "region": "ap-southeast-1",
                "public_origin": args.public_origin,
            }
        )
    except (MonitoringError, OSError, ValueError, KeyError, TypeError) as error:
        message = (
            str(error)
            if isinstance(error, MonitoringError)
            else "Monitoring installation failed; configuration output withheld."
        )
        raise SystemExit(message) from None


if __name__ == "__main__":
    main()
