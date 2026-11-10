#!/usr/bin/env python3
# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
# Scope: Implemented the local Supabase-backed test runner.
# Author review: I validated correctness and added boundary checks where needed.

"""Run pytest against the running local Supabase PostgreSQL instance.

The helper reads the CLI's DB_URL in memory and never writes or prints it.
Start the local stack with npx supabase start before invoking this script.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
NPX_COMMAND = "npx.cmd" if os.name == "nt" else "npx"


def supabase_command() -> list[str]:
    """Prefer the project-pinned CLI and fall back to npx when needed."""

    executable = "supabase.cmd" if os.name == "nt" else "supabase"
    local_cli = SERVICE_ROOT / "node_modules" / ".bin" / executable
    if local_cli.exists():
        return [str(local_cli)]
    return [NPX_COMMAND, "supabase"]


def local_database_url() -> str:
    result = subprocess.run(
        [*supabase_command(), "status", "--output", "env"],
        cwd=SERVICE_ROOT,
        capture_output=True,
        check=False,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit("Local Supabase is not running. Start it with 'npx supabase start' first.")

    for line in result.stdout.splitlines():
        name, separator, value = line.partition("=")
        if separator and name.strip() == "DB_URL":
            database_url = value.strip().strip('"').strip("'")
            if database_url.startswith("postgres://"):
                return "postgresql+asyncpg://" + database_url.removeprefix("postgres://")
            if database_url.startswith("postgresql://"):
                return "postgresql+asyncpg://" + database_url.removeprefix("postgresql://")
            return database_url
    raise SystemExit("Could not discover DB_URL from local Supabase status.")


def main() -> None:
    environment = os.environ.copy()
    environment["USER_SERVICE_TEST_DATABASE_URL"] = local_database_url()
    command = [sys.executable, "-m", "pytest", *sys.argv[1:]]
    completed = subprocess.run(command, cwd=SERVICE_ROOT, env=environment, check=False)
    raise SystemExit(completed.returncode)


if __name__ == "__main__":
    main()
