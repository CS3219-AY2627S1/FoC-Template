# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-10
# Scope: Implemented reviewed migration planning, source verification and retry checkpoints.
# Author review: I validated correctness and added boundary checks where needed.

"""Run reviewed expand migrations through Supabase's existing migration history.

New automatic migrations must be listed by SQL fingerprint in migrations.toml.
The author must review compatibility with the currently running application and
its rollback image. Unlisted/destructive changes require an operator. Fingerprints
ignore leading comments only; they deliberately retain the entire SQL body.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tomllib
from pathlib import Path
from uuid import uuid4

from cloud_config import DATABASES
from prepare_databases import TOOLING_IMAGE

POLICY = "deploy/aws/migrations.toml"
NAME = re.compile(r"[0-9]{14}_[A-Za-z0-9_]+\.sql")


class MigrationError(RuntimeError):
    pass


def sql_body(text: str) -> str:
    """Remove only a leading comment preamble, never comments inside SQL/literals."""
    text = text.replace("\r\n", "\n")
    offset = 0
    while offset < len(text):
        if text[offset].isspace():
            offset += 1
        elif text.startswith("--", offset):
            # CLI directives can affect transaction behavior; they are not
            # presentation comments and must remain in the fingerprint.
            if text.startswith("-- pg-delta:", offset):
                break
            end = text.find("\n", offset)
            offset = len(text) if end == -1 else end + 1
        elif text.startswith("/*", offset):
            depth = 1
            offset += 2
            while depth and offset < len(text):
                if text.startswith("/*", offset):
                    depth += 1
                    offset += 2
                elif text.startswith("*/", offset):
                    depth -= 1
                    offset += 2
                else:
                    offset += 1
            if depth:
                raise MigrationError("Unterminated migration header comment.")
        else:
            break
    body = text[offset:]
    if not body:
        raise MigrationError("Migration has no SQL body.")
    return body


def sql_checksum(path: Path) -> str:
    return hashlib.sha256(sql_body(path.read_text(encoding="utf-8")).encode()).hexdigest()


def sql_history(repo: Path) -> dict:
    result = {}
    for service in DATABASES:
        entries = {}
        versions = set()
        for path in sorted((repo / f"{service}-service/supabase/migrations").glob("*.sql")):
            version = path.name.split("_", 1)[0]
            if not NAME.fullmatch(path.name) or version in versions or path.is_symlink():
                raise MigrationError(f"{service}: invalid or duplicate migration version.")
            entries[path.name] = sql_checksum(path)
            versions.add(version)
        if not entries:
            raise MigrationError(f"{service}: missing migration history.")
        result[service] = entries
    return result


def read_policy(repo: Path) -> dict:
    policy = tomllib.loads((repo / POLICY).read_text(encoding="utf-8"))
    if set(policy) != {"version", "automatic"} or policy["version"] != 1:
        raise MigrationError("Invalid migration review policy.")
    if not isinstance(policy["automatic"], dict) or set(policy["automatic"]) - set(DATABASES):
        raise MigrationError("Unknown service in migration review policy.")
    history = sql_history(repo)
    for service, entries in policy["automatic"].items():
        if not isinstance(entries, dict):
            raise MigrationError("Invalid migration review entries.")
        for name, digest in entries.items():
            if not isinstance(digest, str) or history[service].get(name) != digest:
                raise MigrationError(f"{service}: migration review fingerprint differs from SQL.")
    return policy["automatic"]


def migration_versions(history: dict) -> dict:
    return {
        service: sorted(name.split("_", 1)[0] for name in entries)
        for service, entries in history.items()
    }


def plan(previous: dict, target: dict, automatic: dict) -> dict:
    if set(previous) != set(DATABASES) or set(target) != set(DATABASES):
        raise MigrationError("Migration inventory must contain all six owned services.")
    pending = {}
    for service in DATABASES:
        old, new = previous[service], target[service]
        # No removal, rename, rewrite or insertion before an already-applied version.
        if any(new.get(name) != digest for name, digest in old.items()):
            raise MigrationError(
                f"{service}: applied migration SQL changed; operator review required."
            )
        names = sorted(set(new) - set(old))
        last = max((name.split("_", 1)[0] for name in old), default="")
        for name in names:
            if name.split("_", 1)[0] <= last:
                raise MigrationError(f"{service}: backfilled migration requires operator review.")
            if automatic.get(service, {}).get(name) != new[name]:
                raise MigrationError(
                    f"{service}: new migration lacks backward-compatible approval."
                )
        pending[service] = names
    return pending


def run_cli(
    binary: Path | str, workdir: Path | str, url: str, *, prefix: tuple | list = ()
) -> None:
    # Supabase owns schema_migrations and the per-migration transaction. Never
    # replay seed.sql, provision roles, reset databases or print provider output.
    try:
        result = subprocess.run(
            [*prefix, str(binary), "migration", "up", "--db-url", url, "--workdir", str(workdir)],
            capture_output=True,
            text=True,
            timeout=300,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise MigrationError(
            "Migration command unavailable or timed out; no image rollout."
        ) from None
    if result.returncode:
        raise MigrationError(
            "Supabase migration failed; no image rollout. Provider output withheld."
        )


def run_packaged_cli(node_modules: Path, workdir: Path, url: str, *, network="host") -> None:
    # Use npm's public launcher: the pinned package selects the native executable
    # from @supabase/cli-<platform>, rather than the historical bin/supabase path.
    if not (node_modules / "supabase/package.json").is_file():
        raise MigrationError("Pinned Supabase npm installation is missing.")
    docker = ["sudo", "docker"] if os.name == "posix" and os.getuid() != 0 else ["docker"]
    name = "foc-migration-" + uuid4().hex
    prefix = [
        *docker,
        "run",
        "--rm",
        "--name",
        name,
        "--network",
        network,
        # Keep generated .temp files owned by the operator/CI runner. A root
        # container would make the private source directory impossible to clean.
        *(["--user", f"{os.getuid()}:{os.getgid()}"] if os.name == "posix" else []),
        "--env",
        "HOME=/tmp",
        "--mount",
        f"type=bind,src={node_modules},dst=/foc-cli/node_modules,readonly",
        "--mount",
        f"type=bind,src={workdir},dst=/foc-migrations",
        "--workdir",
        "/foc-migrations",
        TOOLING_IMAGE,
    ]
    try:
        run_cli("/foc-cli/node_modules/.bin/supabase", "/foc-migrations", url, prefix=prefix)
    finally:
        # Killing a timed-out Docker client does not kill its container. Stop our
        # own runner too, so it cannot continue SQL after the release lock exits.
        try:
            subprocess.run(
                [*docker, "rm", "--force", name], capture_output=True, timeout=30, check=False
            )
        except (OSError, subprocess.TimeoutExpired):
            raise MigrationError(
                "Migration runner cleanup uncertain; inspect before retrying."
            ) from None


class MigrationRelease:
    def __init__(self, state: Path, repo: Path, runtime, write):
        self.state, self.repo, self.runtime, self.write = state, repo, runtime, write

    def legacy_history(self, baseline: dict) -> dict:
        from release_manifest import migrations

        if baseline == {"migrations": migrations(self.repo)}:
            return sql_history(self.repo)
        # A one-time helper upgrade may update the operator checkout first. Use
        # only the last recorded deployed source, checking every old raw hash.
        receipt = json.loads((self.state / "current.json").read_text())["manifest"]
        if receipt["migrations"] != baseline["migrations"] or not re.fullmatch(
            r"[a-f0-9]{40}", receipt["commit"]
        ):
            raise MigrationError("Legacy baseline changed; operator review required.")
        result = {}
        for service, entries in baseline["migrations"].items():
            result[service] = {}
            for name, digest in entries.items():
                if service not in DATABASES or not NAME.fullmatch(name):
                    raise MigrationError("Invalid legacy migration inventory.")
                reference = f"{receipt['commit']}:{service}-service/supabase/migrations/{name}"
                source = subprocess.run(
                    ["git", "-C", str(self.repo), "show", reference],
                    capture_output=True,
                    text=True,
                    timeout=15,
                    check=False,
                )
                text = source.stdout.replace("\r\n", "\n")
                if source.returncode or hashlib.sha256(text.encode()).hexdigest() != digest:
                    raise MigrationError("Cannot verify the legacy migration baseline.")
                result[service][name] = hashlib.sha256(sql_body(text).encode()).hexdigest()
        return result

    def apply(self, target_repo: Path) -> None:
        baseline_path = self.state / "schema.json"
        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
        if set(baseline) == {"migrations"}:
            previous = self.legacy_history(baseline)
        elif set(baseline) == {"version", "migrations"} and baseline["version"] == 2:
            previous = baseline["migrations"]
        else:
            raise MigrationError("Unknown installed migration baseline.")
        target = sql_history(target_repo)
        automatic = read_policy(target_repo)
        pending = plan(previous, target, automatic)  # Validate every service before any SQL.
        applied = self.runtime.database_versions()
        intent_path = self.state / "migration-intent.json"
        if intent_path.exists():
            intent = json.loads(intent_path.read_text(encoding="utf-8"))
            if set(intent) != {"before", "target"} or intent["before"] != previous:
                # A completed checkpoint may survive a crash before journal removal.
                if intent.get("target") != previous:
                    raise MigrationError("Migration checkpoint requires operator review.")
            else:
                planned = intent["target"]
                plan(previous, planned, automatic)
                plan(planned, target, automatic)
                # A killed CLI may have committed a prefix before the process exited.
                # Adopt only this saved, approved intent, never arbitrary DB drift.
                recovered = {}
                for service, entries in planned.items():
                    versions = applied.get(service, [])
                    wanted = migration_versions({service: entries})[service]
                    old_versions = migration_versions({service: previous[service]})[service]
                    if versions != wanted[: len(versions)] or len(versions) < len(old_versions):
                        raise MigrationError(
                            "Database versions differ from saved migration intent."
                        )
                    recovered[service] = {
                        name: digest
                        for name, digest in entries.items()
                        if name.split("_", 1)[0] in versions
                    }
                previous = recovered
        if applied != migration_versions(previous):
            raise MigrationError("Database migration versions differ from the reviewed baseline.")
        self.write(baseline_path, {"version": 2, "migrations": previous})
        intent_path.unlink(missing_ok=True)
        pending = plan(previous, target, automatic)
        for service, names in pending.items():
            if not names:
                continue
            next_history = {**previous, service: target[service]}
            self.write(intent_path, {"before": previous, "target": next_history})
            self.runtime.migrate(service, target_repo)
            if self.runtime.database_versions() != migration_versions(next_history):
                raise MigrationError(
                    "Migration did not reach its expected version; no image rollout."
                )
            previous = next_history
            self.write(baseline_path, {"version": 2, "migrations": previous})
            intent_path.unlink()
        print("Reviewed database migrations are current; schema rollback is never automatic.")
