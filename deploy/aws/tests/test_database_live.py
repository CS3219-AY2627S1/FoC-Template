# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-02
# Scope: Implemented and debugged disposable database credentials and grants tests.
# Author review: I validated correctness and added boundary checks where needed.

"""Opt-in check of a freshly bootstrapped User DB on the disposable CI runner."""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from cloud_config import load_database_secrets
from prepare_databases import docker


@unittest.skipUnless(os.environ.get("CLOUD_DB_SMOKE") == "1", "disposable runner DB only")
class DatabaseAccessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.state = load_database_secrets()["user"]

    def query(self, username, password, sql):
        # Use the real published TCP path, not the DB container's loopback trust rule.
        return docker(
            "run",
            "--rm",
            "--network",
            "host",
            "-i",
            "--env",
            f"PGPASSWORD={password}",
            "postgres:17-alpine",
            "psql",
            "--host",
            "127.0.0.1",
            "--port",
            "15422",
            "--username",
            username,
            "--dbname",
            "postgres",
            "--no-password",
            "--no-psqlrc",
            "--set",
            "ON_ERROR_STOP=1",
            "--quiet",
            input_text=sql,
        )

    def test_runtime_reads_owned_schema_and_cannot_create_authority_or_ddl(self):
        username, password = "foc_user_runtime", self.state["runtime_password"]
        self.assertEqual(
            self.query(username, password, "SELECT count(*) FROM user_service.users;").returncode, 0
        )
        for statement in (
            "CREATE ROLE cloud_forbidden SUPERUSER;",
            "CREATE TABLE user_service.cloud_forbidden (id int);",
            "SELECT * FROM supabase_migrations.schema_migrations;",
        ):
            with self.subTest(statement=statement):
                self.assertNotEqual(self.query(username, password, statement).returncode, 0)

    def test_default_admin_password_fails_and_generated_password_works(self):
        self.assertNotEqual(self.query("postgres", "postgres", "SELECT 1;").returncode, 0)
        self.assertEqual(
            self.query("postgres", self.state["admin_password"], "SELECT 1;").returncode, 0
        )
