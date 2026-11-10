# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-03
# Scope: Implemented optional SES email configuration updates.
# Author review: I validated correctness and added boundary checks where needed.

"""Select SMTP/Mailpit or SES in the existing EC2 environment without changing secrets."""

from __future__ import annotations

import argparse
import os
import re
import tempfile
from pathlib import Path

from cloud_config import ROOT, read_environment


def configure(root: Path, provider: str, region: str, sender: str | None) -> None:
    if provider not in {"smtp", "ses"}:
        raise ValueError("Select smtp or ses.")
    updates = {"OTP_EMAIL_PROVIDER": provider}
    if provider == "ses":
        if not re.fullmatch(r"[a-z]{2}(?:-[a-z]+)+-\d+", region):
            raise ValueError("Use a valid SES region.")
        if not sender or not re.fullmatch(
            r"[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}", sender
        ):
            raise ValueError("Use the exact verified sender mailbox, without a display name.")
        updates.update(SES_REGION=region, SES_FROM_ADDRESS=sender)
    path = root / ".env"
    original = path.read_text(encoding="utf-8")
    if read_environment(path).get("FOC_USER_UID") != str(os.getuid()):
        raise ValueError("Run as the session user who generated the existing cloud configuration.")
    updated = original
    for key, value in updates.items():
        matches = list(re.finditer(rf"(?m)^{key}=.*$", updated))
        if len(matches) > 1:
            raise ValueError("Duplicate email configuration; preserve and inspect the environment.")
        replacement = f"{key}='{value}'"
        if matches:
            match = matches[0]
            updated = updated[: match.start()] + replacement + updated[match.end() :]
        else:
            updated = updated.rstrip("\n") + "\n" + replacement + "\n"
    if updated == original:
        return
    descriptor, temporary = tempfile.mkstemp(prefix=".email-", dir=root)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(updated)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", choices=("smtp", "ses"), required=True)
    parser.add_argument("--region", default="ap-southeast-1")
    parser.add_argument("--sender")
    args = parser.parse_args()
    try:
        if os.name != "posix" or os.getuid() == 0:
            raise ValueError("Configure cloud email on EC2 as the session user, without sudo.")
        configure(ROOT, args.provider, args.region, args.sender)
    except (ValueError, OSError) as error:
        if isinstance(error, ValueError):
            raise SystemExit(str(error)) from None
        raise SystemExit("Email configuration update failed; no secrets were printed.") from None
    print(
        "Updated only cloud email settings. Recreate User API to apply; AWS sender/IAM setup is separate."
    )


if __name__ == "__main__":
    main()
