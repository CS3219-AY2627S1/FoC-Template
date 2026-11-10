#!/usr/bin/env python3
# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented the isolated Chat identity regression runner.
# Author review: I validated correctness and added boundary checks where needed.

"""Run tests on a dedicated local Supabase project; never use the linked database."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

SERVICE_ROOT = Path(__file__).resolve().parents[1]
RESOURCE_ROOT = SERVICE_ROOT / ".test-resources"
PROJECT_ROOT = RESOURCE_ROOT / "chat-interface"
PROJECT_ID = "foc-user-chat-test"
DATABASE_PORT = 18422
EXCLUDED_CONTAINERS = (
    "gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,"
    "edge-runtime,logflare,vector,supavisor"
)


def cli_command() -> list[str]:
    executable = "supabase.cmd" if os.name == "nt" else "supabase"
    local_cli = SERVICE_ROOT / "node_modules" / ".bin" / executable
    return (
        [str(local_cli)]
        if local_cli.exists()
        else [
            "npx.cmd" if os.name == "nt" else "npx",
            "--no-install",
            "supabase",
        ]
    )


def local_cli(*arguments: str) -> str:
    """Keep CLI status/credentials in memory, including on command failure."""

    completed = subprocess.run(
        [*cli_command(), *arguments, "--workdir", str(PROJECT_ROOT)],
        cwd=SERVICE_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode:
        raise SystemExit(
            f"Isolated Supabase {' '.join(arguments[:2])} failed (exit {completed.returncode}). "
            "Check Docker and the locally installed Supabase CLI; CLI payload withheld."
        )
    return completed.stdout


def verify_project() -> None:
    config_path = PROJECT_ROOT / "supabase" / "config.toml"
    config = tomllib.loads(config_path.read_text(encoding="utf-8-sig"))
    if config.get("project_id") != PROJECT_ID or config.get("db", {}).get("port") != DATABASE_PORT:
        raise SystemExit("Refusing to use a test project with an unexpected identity or port.")
    if (PROJECT_ROOT / "supabase" / ".temp" / "project-ref").exists():
        raise SystemExit("Refusing to use a test project with cloud link state.")


def prepare_project() -> None:
    RESOURCE_ROOT.mkdir(exist_ok=True)
    ignore_path = RESOURCE_ROOT / ".gitignore"
    if not ignore_path.exists():
        ignore_path.write_text("*\n", encoding="utf-8")
    config_path = PROJECT_ROOT / "supabase" / "config.toml"
    if config_path.exists():
        verify_project()
    else:
        config_path.parent.mkdir(parents=True, exist_ok=True)
        canonical = (SERVICE_ROOT / "supabase" / "config.toml").read_text(encoding="utf-8")
        config_path.write_text(
            canonical.replace(
                'project_id = "user-service"', f'project_id = "{PROJECT_ID}"'
            ).replace("154", "184"),
            encoding="utf-8",
        )
        verify_project()
    canonical_migrations = SERVICE_ROOT / "supabase" / "migrations"
    copied_migrations = config_path.parent / "migrations"
    copied_migrations.mkdir(exist_ok=True)
    source_files = {path.name: path for path in canonical_migrations.glob("*.sql")}
    if {path.name for path in copied_migrations.glob("*.sql")} - source_files.keys():
        raise SystemExit("Unexpected test migration copy; inspect it before continuing.")
    for name, source in source_files.items():
        shutil.copyfile(source, copied_migrations / name)


def isolated_database_url() -> str:
    verify_project()
    output = local_cli("status", "--output", "env")
    for line in output.splitlines():
        name, separator, value = line.partition("=")
        if separator and name.strip() == "DB_URL":
            url = value.strip().strip('"').strip("'")
            parsed = urlsplit(url)
            if (
                parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
                or parsed.port != DATABASE_PORT
                or parsed.path != "/postgres"
            ):
                raise SystemExit(
                    "Refusing a database URL outside the dedicated loopback test project."
                )
            if parsed.scheme not in {"postgres", "postgresql", "postgresql+asyncpg"}:
                raise SystemExit("Unexpected database URL scheme.")
            return url.replace(parsed.scheme + "://", "postgresql+asyncpg://", 1)
    raise SystemExit("Dedicated test database URL unavailable; no credentials were printed.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reset", action="store_true", help="Rebuild only the dedicated test project"
    )
    arguments, pytest_arguments = parser.parse_known_args()
    prepare_project()
    print(
        f"Starting dedicated local Supabase project {PROJECT_ID} on port {DATABASE_PORT}.",
        flush=True,
    )
    local_cli("start", "--exclude", EXCLUDED_CONTAINERS)
    if arguments.reset:
        verify_project()
        local_cli("db", "reset", "--local", "--no-seed", "--yes")
        print("Rebuilt isolated database using the canonical Supabase migrations.", flush=True)
    environment = os.environ.copy()
    environment["USER_SERVICE_TEST_DATABASE_URL"] = isolated_database_url()
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "--basetemp",
            str(RESOURCE_ROOT / f"pytest-{uuid4().hex}"),
            *(pytest_arguments or ["-q"]),
        ],
        cwd=SERVICE_ROOT,
        env=environment,
        check=False,
    )
    raise SystemExit(completed.returncode)


if __name__ == "__main__":
    main()
