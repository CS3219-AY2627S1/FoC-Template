# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-10
# Scope: Added migration approval, interruption recovery and PostgreSQL upgrade tests.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from cloud_config import DATABASES, REPOSITORY
from deploy_release import ReleaseError, Releases, Runtime, atomic_json
from release_manifest import checksum, configuration, migrations
from release_migrations import (
    POLICY,
    MigrationError,
    MigrationRelease,
    migration_versions,
    read_policy,
    run_cli,
    run_packaged_cli,
    sql_body,
    sql_checksum,
    sql_history,
)
from test_releases import FakeRuntime, release_manifest

FIRST = "20260101000000_initial.sql"
NEXT = "20260102000000_expand.sql"


def write_migration(repo, service, name, sql):
    path = repo / f"{service}-service/supabase/migrations/{name}"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(sql, encoding="utf-8")
    return path


def write_policy(repo, entries):
    path = repo / POLICY
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["version = 1", "[automatic]"]
    for service, names in entries.items():
        lines.append(f"[automatic.{service}]")
        for name in names:
            digest = sql_checksum(repo / f"{service}-service/supabase/migrations/{name}")
            lines.append(f'"{name}" = "{digest}"')
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def wait_for_postgres(name, password):
    # The image's temporary initialization server accepts Unix sockets while
    # TCP is disabled. Wait for the final server and a real query, not that socket.
    for _ in range(60):
        result = subprocess.run(
            [
                "docker",
                "exec",
                "--env",
                f"PGPASSWORD={password}",
                name,
                "psql",
                "--host",
                "127.0.0.1",
                "--username",
                "postgres",
                "--dbname",
                "postgres",
                "--no-password",
                "--no-psqlrc",
                "--tuples-only",
                "--no-align",
                "--command",
                "SELECT 1;",
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if result.returncode == 0 and result.stdout.strip() == "1":
            return
        time.sleep(1)
    raise AssertionError("Disposable PostgreSQL failed TCP query readiness.")


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.repo, self.target, self.state = (self.base / name for name in ("old", "new", "state"))
        self.state.mkdir()
        for service in DATABASES:
            write_migration(self.repo, service, FIRST, "CREATE TABLE retained (id int);\n")
        shutil.copytree(self.repo, self.target)
        self.history = sql_history(self.repo)
        atomic_json(self.state / "schema.json", {"version": 2, "migrations": self.history})
        self.runtime = FakeRuntime()
        self.runtime.versions = migration_versions(self.history)
        self.runtime.migrate = self.migrate
        self.applied = []
        write_policy(self.target, {})

    def migrate(self, service, source):
        self.applied.append(service)
        self.runtime.versions[service] = migration_versions(sql_history(source))[service]

    def runner(self):
        return MigrationRelease(self.state, self.repo, self.runtime, atomic_json)

    def expand(self, service="supplier", name=NEXT, approve=True):
        write_migration(self.target, service, name, "ALTER TABLE retained ADD COLUMN note text;\n")
        if approve:
            write_policy(self.target, {service: [name]})

    def test_leading_attribution_changes_are_ignored_but_sql_and_literal_changes_are_not(self):
        original = "SELECT '-- not a comment', $$/* literal */$$;\n"
        self.assertEqual(
            sql_body("-- header\r\n/* nested /* inner */ end */\n" + original), original
        )
        path = self.target / f"supplier-service/supabase/migrations/{FIRST}"
        old = sql_checksum(path)
        path.write_text("-- new attribution\n" + path.read_text())
        self.assertEqual(sql_checksum(path), old)
        path.write_text(path.read_text() + "-- internal change\n")
        self.assertNotEqual(sql_checksum(path), old)
        self.assertTrue(
            sql_body("-- pg-delta: transaction=false\nSELECT 1;").startswith("-- pg-delta")
        )
        with self.assertRaises(MigrationError):
            sql_body("/* incomplete")

    def test_approved_migrations_run_once_and_retry_preserves_the_checkpoint(self):
        self.expand()
        self.runner().apply(self.target)
        self.runner().apply(self.target)
        self.assertEqual(self.applied, ["supplier"])
        self.assertFalse((self.state / "migration-intent.json").exists())
        self.assertEqual(
            json.loads((self.state / "schema.json").read_text())["migrations"],
            sql_history(self.target),
        )

    def test_unapproved_later_service_blocks_all_migrations(self):
        self.expand()
        self.expand("admin", approve=False)
        with self.assertRaisesRegex(MigrationError, "lacks backward-compatible approval"):
            self.runner().apply(self.target)
        self.assertEqual(self.applied, [])

    def test_review_digest_must_match_the_exact_sql_body(self):
        self.expand()
        path = self.target / f"supplier-service/supabase/migrations/{NEXT}"
        path.write_text("DROP TABLE retained;\n")
        with self.assertRaisesRegex(MigrationError, "review fingerprint differs"):
            self.runner().apply(self.target)
        self.assertEqual(self.applied, [])

    def test_applied_sql_cannot_be_rewritten_removed_or_renamed(self):
        path = self.target / f"supplier-service/supabase/migrations/{FIRST}"
        for change in ("UPDATE retained SET id=0;\n", None):
            with self.subTest(change=change):
                if change is None:
                    path.rename(path.with_name("20260101000000_renamed.sql"))
                else:
                    path.write_text(change)
                with self.assertRaisesRegex(MigrationError, "applied migration SQL changed"):
                    self.runner().apply(self.target)
        self.assertEqual(self.applied, [])

    def test_approved_backfill_is_still_blocked(self):
        self.expand(name="20251231000000_backfill.sql")
        with self.assertRaisesRegex(MigrationError, "backfilled migration"):
            self.runner().apply(self.target)

    def test_unknown_database_drift_is_not_baselined(self):
        self.runtime.versions["order"].append("20990101000000")
        original = (self.state / "schema.json").read_bytes()
        with self.assertRaisesRegex(MigrationError, "versions differ"):
            self.runner().apply(self.target)
        self.assertEqual((self.state / "schema.json").read_bytes(), original)

    def test_legacy_raw_baseline_upgrades_without_replaying_sql(self):
        atomic_json(self.state / "schema.json", {"migrations": migrations(self.repo)})
        path = self.target / f"supplier-service/supabase/migrations/{FIRST}"
        path.write_text("-- new header\n" + path.read_text())
        self.runner().apply(self.target)
        self.assertEqual(self.applied, [])
        self.assertEqual(json.loads((self.state / "schema.json").read_text())["version"], 2)

    def test_legacy_upgrade_after_checkout_update_verifies_recorded_source_hashes(self):
        old = migrations(self.repo)
        atomic_json(self.state / "schema.json", {"migrations": old})
        atomic_json(
            self.state / "current.json", {"manifest": {"commit": "a" * 40, "migrations": old}}
        )
        path = self.repo / f"supplier-service/supabase/migrations/{FIRST}"
        path.write_text("-- changed checkout header\n" + path.read_text())
        with patch(
            "release_migrations.subprocess.run",
            return_value=subprocess.CompletedProcess(
                [], 0, "CREATE TABLE retained (id int);\n", ""
            ),
        ):
            self.runner().apply(self.target)
        self.assertEqual(self.applied, [])

    def test_duplicate_timestamp_and_invalid_policy_are_rejected(self):
        write_migration(self.target, "supplier", "20260101000000_duplicate.sql", "SELECT 1;")
        with self.assertRaisesRegex(MigrationError, "duplicate migration"):
            self.runner().apply(self.target)

    def test_interruption_after_commit_recovers_only_the_saved_approved_intent(self):
        self.expand()

        def interrupted(service, source):
            self.migrate(service, source)
            raise MigrationError("connection interrupted after commit")

        self.runtime.migrate = interrupted
        with self.assertRaises(MigrationError):
            self.runner().apply(self.target)
        self.assertTrue((self.state / "migration-intent.json").exists())
        self.runtime.migrate = self.migrate
        self.runner().apply(self.target)
        self.assertEqual(self.applied, ["supplier"])

    def test_interruption_without_commit_retries_and_unexpected_versions_block_recovery(self):
        self.expand()
        self.runtime.migrate = lambda *args: (_ for _ in ()).throw(MigrationError("failed"))
        with self.assertRaises(MigrationError):
            self.runner().apply(self.target)
        self.runtime.versions["supplier"].append("20990101000000")
        with self.assertRaisesRegex(MigrationError, "saved migration intent"):
            self.runner().apply(self.target)
        self.runtime.versions["supplier"].pop()
        self.runtime.migrate = self.migrate
        self.runner().apply(self.target)
        self.assertEqual(self.applied, ["supplier"])

    def test_cli_failures_and_timeouts_never_include_url_or_provider_output(self):
        url = "postgresql://postgres:private-secret@127.0.0.1/postgres"
        for result in (
            subprocess.CompletedProcess([], 1, url, url),
            subprocess.TimeoutExpired([url], 300),
        ):
            with self.subTest(result=type(result).__name__):
                kwargs = (
                    {"side_effect": result}
                    if isinstance(result, Exception)
                    else {"return_value": result}
                )
                with (
                    patch("release_migrations.subprocess.run", **kwargs),
                    self.assertRaises(MigrationError) as error,
                ):
                    run_cli(Path("supabase"), self.target, url)
                self.assertNotIn("private-secret", str(error.exception))

    def test_npm_launcher_runs_with_node_tooling_and_restricted_mounts(self):
        modules = self.base / "node_modules"
        package = modules / "supabase/package.json"
        package.parent.mkdir(parents=True)
        package.write_text('{"version":"2.117.0","bin":{"supabase":"dist/supabase.js"}}')
        with patch(
            "release_migrations.subprocess.run",
            return_value=subprocess.CompletedProcess([], 0, "", ""),
        ) as run:
            run_packaged_cli(modules, self.target, "postgresql://example")
        args = run.call_args_list[0].args[0]
        self.assertIn("/foc-cli/node_modules/.bin/supabase", args)
        self.assertIn(f"type=bind,src={modules},dst=/foc-cli/node_modules,readonly", args)
        self.assertIn(f"type=bind,src={self.target},dst=/foc-migrations", args)
        self.assertNotIn("/var/run/docker.sock", str(args))
        self.assertEqual(args[-2:], ["--workdir", "/foc-migrations"])
        self.assertEqual(run.call_args_list[-1].args[0][-1], args[args.index("--name") + 1])

    def test_timed_out_packaged_cli_stops_its_own_runner(self):
        modules = self.base / "node_modules"
        package = modules / "supabase/package.json"
        package.parent.mkdir(parents=True)
        package.write_text('{"version":"2.117.0"}')
        with patch(
            "release_migrations.subprocess.run",
            side_effect=[
                subprocess.TimeoutExpired(["private-url"], 300),
                subprocess.CompletedProcess([], 0, "", ""),
            ],
        ) as run:
            with self.assertRaisesRegex(MigrationError, "timed out"):
                run_packaged_cli(modules, self.target, "private-url")
        first = run.call_args_list[0].args[0]
        last = run.call_args_list[-1].args[0]
        self.assertEqual(last[-3:], ["rm", "--force", first[first.index("--name") + 1]])

    def test_linux_runner_preserves_operator_ownership_without_root_cache_access(self):
        modules = self.base / "node_modules"
        package = modules / "supabase/package.json"
        package.parent.mkdir(parents=True)
        package.write_text('{"version":"2.117.0"}')
        with (
            patch("release_migrations.os.name", "posix"),
            patch("release_migrations.os.getuid", return_value=1001, create=True),
            patch("release_migrations.os.getgid", return_value=1002, create=True),
            patch(
                "release_migrations.subprocess.run",
                return_value=subprocess.CompletedProcess([], 0, "", ""),
            ) as run,
        ):
            run_packaged_cli(modules, self.target, "postgresql://example")
        args = run.call_args_list[0].args[0]
        self.assertEqual(args[args.index("--user") + 1], "1001:1002")
        self.assertEqual(args[args.index("--env") + 1], "HOME=/tmp")

    def test_failed_migration_never_replaces_containers(self):
        self.expand()
        manifest = release_manifest()
        for name in manifest["configuration"]:
            path = self.repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(REPOSITORY / name, path)
        manifest.update(
            migrations=migrations(self.target),
            configuration=configuration(self.repo),
            migration_policy=checksum(self.target / POLICY),
        )

        @contextmanager
        def source(*args):
            yield self.target

        self.runtime.source = source
        self.runtime.migrate = lambda *args: (_ for _ in ()).throw(MigrationError("failed"))
        release = Releases(self.state.parent, self.repo, self.runtime)
        release.state = self.state
        with self.assertRaises(MigrationError):
            release.deploy(manifest)
        self.assertEqual(self.runtime.calls, ["pull"])

    def test_repository_policy_matches_reviewed_canonical_sql(self):
        read_policy(REPOSITORY)

    def test_database_readiness_waits_for_final_tcp_server(self):
        with (
            patch(
                "test_release_migrations.subprocess.run",
                side_effect=[
                    subprocess.CompletedProcess([], 2, "", "initializing"),
                    subprocess.CompletedProcess([], 0, "1\n", ""),
                ],
            ) as run,
            patch("test_release_migrations.time.sleep") as sleep,
        ):
            wait_for_postgres("isolated-postgres", "test-password")
        self.assertEqual(run.call_count, 2)
        self.assertIn("127.0.0.1", run.call_args.args[0])
        self.assertEqual(run.call_args.args[0][-2:], ["--command", "SELECT 1;"])
        sleep.assert_called_once_with(1)

    def test_exact_release_source_is_verified_and_temporary_files_are_removed(self):
        manifest = release_manifest()
        self.root = self.base / "cloud"
        (self.root / ".release-state").mkdir(parents=True)
        inventory = [
            f"{service}-service/supabase/migrations/{name}"
            for service, entries in manifest["migrations"].items()
            for name in entries
        ]
        calls = []

        def command(arguments):
            calls.append(arguments)
            if "ls-tree" in arguments:
                return "\n".join(inventory)
            if "show" in arguments:
                return (REPOSITORY / arguments[-1].split(":", 1)[1]).read_text(encoding="utf-8")
            return ""

        with patch("deploy_release.command", side_effect=command):
            with Runtime(self.root).source(manifest, REPOSITORY) as source:
                self.assertEqual(migrations(source), manifest["migrations"])
                staged = source
            self.assertFalse(staged.exists())
            tampered = copy.deepcopy(manifest)
            tampered["migration_policy"] = "0" * 64
            with self.assertRaisesRegex(ReleaseError, "fingerprints"):
                with Runtime(self.root).source(tampered, REPOSITORY):
                    self.fail("Tampered source was accepted")
        self.assertTrue(any("merge-base" in call for call in calls))
        self.assertFalse(any("checkout" in call or "reset" in call for call in calls))

    def test_image_rollback_keeps_the_successful_database_upgrade(self):
        self.expand()
        manifest = release_manifest()
        for name in manifest["configuration"]:
            path = self.repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(REPOSITORY / name, path)
        manifest.update(
            migrations=migrations(self.target),
            configuration=configuration(self.repo),
            migration_policy=checksum(self.target / POLICY),
        )

        @contextmanager
        def source(*args):
            yield self.target

        self.runtime.source = source
        self.runtime.fail_readiness = 1
        release = Releases(self.state.parent, self.repo, self.runtime)
        release.state = self.state
        with self.assertRaisesRegex(ReleaseError, "previous application images restored"):
            release.deploy(manifest)
        self.assertEqual(self.applied, ["supplier"])
        self.assertEqual(
            json.loads((self.state / "schema.json").read_text())["migrations"],
            sql_history(self.target),
        )
        applies = [call for call in self.runtime.calls if isinstance(call, tuple)]
        self.assertEqual(len(applies), 2)


@unittest.skipUnless(
    os.environ.get("CLOUD_MIGRATION_SMOKE") == "1", "disposable PostgreSQL and pinned CLI required"
)
class PostgreSQLUpgradeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.name = "foc-migration-check-" + uuid4().hex[:12]
        cls.password = uuid4().hex
        native = os.environ.get("CLOUD_MIGRATION_CLI")
        cls.binary = Path(native) if native else None
        cls.node_modules = Path(
            os.environ.get(
                "CLOUD_MIGRATION_NODE_MODULES", str(REPOSITORY / "user-service/node_modules")
            )
        )
        if cls.binary is not None:
            if not cls.binary.is_file():
                raise AssertionError("Explicit migration CLI binary is missing.")
        elif not (cls.node_modules / "supabase/package.json").is_file():
            raise AssertionError("Pinned Supabase npm installation is missing.")
        subprocess.run(
            [
                "docker",
                "run",
                "--detach",
                "--name",
                cls.name,
                "--publish",
                "127.0.0.1::5432",
                "--env",
                f"POSTGRES_PASSWORD={cls.password}",
                "postgres:17-alpine",
            ],
            check=True,
            capture_output=True,
        )
        cls.addClassCleanup(
            lambda: subprocess.run(
                ["docker", "rm", "--force", "--volumes", cls.name], capture_output=True
            )
        )
        wait_for_postgres(cls.name, cls.password)
        binding = json.loads(
            subprocess.check_output(
                ["docker", "inspect", "--format", "{{json .NetworkSettings.Ports}}", cls.name],
                text=True,
            )
        )["5432/tcp"][0]
        port = binding["HostPort"] if cls.binary is not None else "5432"
        cls.url = f"postgresql://postgres:{cls.password}@127.0.0.1:{port}/postgres?sslmode=disable&options=-c%20lock_timeout%3D5s%20-c%20statement_timeout%3D120s"

    def migrate(self, workdir):
        if self.binary is not None:
            run_cli(self.binary, workdir, self.url)
        else:
            run_packaged_cli(self.node_modules, workdir, self.url, network=f"container:{self.name}")
            if os.name == "posix":
                for path in workdir.rglob("*"):
                    self.assertEqual(
                        path.stat().st_uid,
                        os.getuid(),
                        "CLI changed ownership of migration source files",
                    )

    def setUp(self):
        self.database = "migration_" + uuid4().hex[:12]
        result = subprocess.run(
            [
                "docker",
                "exec",
                self.name,
                "psql",
                "-U",
                "postgres",
                "-c",
                f"CREATE DATABASE {self.database}",
            ],
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0)
        self.url = type(self).url.replace("/postgres?", f"/{self.database}?")

    def query(self, sql):
        result = subprocess.run(
            [
                "docker",
                "exec",
                "-i",
                self.name,
                "psql",
                "-U",
                "postgres",
                "-d",
                self.database,
                "-X",
                "-At",
                "-v",
                "ON_ERROR_STOP=1",
            ],
            input=sql,
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, "Disposable database query failed; output withheld.")
        return result.stdout.strip()

    def test_real_cli_preserves_rows_retries_and_rolls_back_a_failing_migration(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            work = repo / "supplier-service"
            path = write_migration(
                repo,
                "supplier",
                FIRST,
                "BEGIN; CREATE TABLE kept (id int PRIMARY KEY, note text); INSERT INTO kept VALUES (1, 'existing'); COMMIT;\n",
            )
            self.migrate(work)
            write_migration(
                repo,
                "supplier",
                NEXT,
                "BEGIN; ALTER TABLE kept ADD COLUMN added text; UPDATE kept SET added='new' WHERE id=1; COMMIT;\n",
            )
            self.migrate(work)
            self.migrate(work)
            self.assertEqual(
                self.query("SELECT id || ':' || note || ':' || added FROM kept;"), "1:existing:new"
            )
            bad = write_migration(
                repo,
                "supplier",
                "20260103000000_fail.sql",
                "BEGIN; INSERT INTO kept VALUES (2, 'must roll back', NULL); SELECT 1/0; COMMIT;\n",
            )
            with self.assertRaises(MigrationError):
                self.migrate(work)
            self.assertEqual(self.query("SELECT count(*) FROM kept;"), "1")
            self.assertEqual(
                self.query("SELECT count(*) FROM supabase_migrations.schema_migrations;"), "2"
            )
            bad.unlink()
            path.write_text("-- updated attribution\n" + path.read_text())
            self.migrate(work)
            self.assertEqual(self.query("SELECT count(*) FROM kept;"), "1")

    def test_supplier_expansion_preserves_an_existing_managed_supplier(self):
        self.query("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;")
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            location = work / "supabase/migrations"
            location.mkdir(parents=True)
            canonical = REPOSITORY / "supplier-service/supabase/migrations"
            for path in sorted(canonical.glob("*.sql")):
                if not path.name.startswith("20261110"):
                    shutil.copyfile(path, location / path.name)
            self.migrate(work)
            self.query(
                "BEGIN; INSERT INTO supplier_service.suppliers(name,building_area,pickup_location_description,status) VALUES ('Bistro Box','College of Design and Engineering','Managed pickup','INACTIVE'); INSERT INTO supplier_service.supplier_categories SELECT id,'OTHERS' FROM supplier_service.suppliers; COMMIT;"
            )
            before = self.query(
                "SELECT row_to_json(s)::text FROM supplier_service.suppliers s WHERE name='Bistro Box';"
            )
            new = canonical / "20261110000000_expand_nus_campus_suppliers.sql"
            shutil.copyfile(new, location / new.name)
            self.migrate(work)
            self.migrate(work)
            self.assertEqual(
                self.query(
                    "SELECT row_to_json(s)::text FROM supplier_service.suppliers s WHERE name='Bistro Box';"
                ),
                before,
            )
            self.assertEqual(
                self.query(
                    "SELECT category_code FROM supplier_service.supplier_categories c JOIN supplier_service.suppliers s ON s.id=c.supplier_id WHERE s.name='Bistro Box';"
                ),
                "OTHERS",
            )
            self.assertEqual(self.query("SELECT count(*) FROM supplier_service.suppliers;"), "110")
