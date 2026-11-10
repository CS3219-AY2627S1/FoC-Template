# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21
# Scope: Implemented the local Super Admin bootstrap command.
# Author review: I validated correctness and added boundary checks where needed.

"""One-shot command for creating the first verified Super Admin.

Run ``bootstrap-super-admin`` only with explicit local secret-file settings.
The command never prints the supplied credentials or password hash.
"""

from __future__ import annotations

import asyncio
import sys
from uuid import uuid4

from app.admin.lifecycle import (
    BootstrapAlreadyCompletedError,
    BootstrapConfigurationError,
    BootstrapCredentialConflictError,
    BootstrapCredentials,
    BootstrapSuperAdminService,
)
from app.core.config import Settings, get_settings
from app.db import Database


async def bootstrap_from_settings(settings: Settings) -> str:
    """Execute the one-shot bootstrap and return only the new non-secret user ID."""

    if settings.database_url is None:
        raise BootstrapConfigurationError("DATABASE_URL must be configured before bootstrap.")
    credentials = BootstrapCredentials.from_settings(settings)
    database = Database(settings.database_url)
    try:
        async for session in database.session():
            user = await BootstrapSuperAdminService(settings).bootstrap(
                session,
                credentials=credentials,
                correlation_id=f"bootstrap-{uuid4().hex}",
            )
            return str(user.id)
    finally:
        await database.dispose()
    raise AssertionError("The configured database did not provide a session.")


def main() -> int:
    """Provide a terse, redacted operator interface for the one-shot command."""

    try:
        user_id = asyncio.run(bootstrap_from_settings(get_settings()))
    except (
        BootstrapConfigurationError,
        BootstrapAlreadyCompletedError,
        BootstrapCredentialConflictError,
    ) as error:
        print(str(error), file=sys.stderr)
        return 1
    except Exception:
        print(
            "Bootstrap failed without creating an administrator. Check service configuration.",
            file=sys.stderr,
        )
        return 1
    print(f"Created verified initial Super Admin with user ID {user_id}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
