# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-02
# Scope: Implemented and debugged cloud configuration and provisioning helpers tests.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import json
import os
import sys
import tempfile
import tomllib
import unittest
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from cloud_config import (
    DATABASES,
    PROJECT_IDS,
    REPOSITORY,
    load_database_secrets,
    read_environment,
    validate_origin,
)
from generate_env import generate, private_file
from prepare_databases import ProvisionError, checked, safe_diagnostic


class SecretGenerationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "cloud"

    @staticmethod
    def keys(directory):
        # Only the external openssl operation is replaced; secrets/file operations are real.
        private_file(directory / "jwt_private_key.pem", "unit-test-private-key")
        private_file(directory / "jwt_public_key.pem", "unit-test-public-key")

    def create(self):
        generate(self.root, "https://example.cloudfront.net", 1001, 1001, self.keys)
        return read_environment(self.root / ".env"), load_database_secrets(self.root)

    def test_generated_database_credentials_are_distinct_and_service_scoped(self):
        environment, state = self.create()
        passwords = []
        for name, (port, _, _) in DATABASES.items():
            url = urlsplit(environment[f"{name.upper()}_DATABASE_URL"])
            self.assertEqual(url.username, f"foc_{name}_runtime")
            self.assertEqual(url.password, state[name]["runtime_password"])
            self.assertEqual(url.port, port)
            passwords += [state[name]["admin_password"], state[name]["runtime_password"]]
            self.assertNotIn(state[name]["admin_password"], (self.root / ".env").read_text())
        self.assertEqual(len(set(passwords)), 12)
        self.assertTrue(all(len(value) == 64 for value in passwords))

    def test_shared_service_secrets_are_separate_identities(self):
        environment, _ = self.create()
        values = [
            environment[key]
            for key in (
                "OTP_HMAC_SECRET",
                "SUPPLIER_SERVICE_SHARED_SECRET",
                "CHAT_SERVICE_SHARED_SECRET",
                "ORDER_CREDIT_SHARED_SECRET",
                "ORDER_ADMIN_SHARED_SECRET",
                "RABBITMQ_PASSWORD",
            )
        ]
        self.assertEqual(len(set(values)), 6)
        self.assertEqual(environment["OPENAI_API_KEY"], "")

    def test_existing_configuration_is_not_rotated(self):
        self.create()
        before = {
            path.relative_to(self.root): path.read_bytes()
            for path in self.root.rglob("*")
            if path.is_file()
        }
        with self.assertRaisesRegex(ValueError, "already exist"):
            self.create()
        after = {
            path.relative_to(self.root): path.read_bytes()
            for path in self.root.rglob("*")
            if path.is_file()
        }
        self.assertEqual(before, after)

    def test_key_generation_failure_does_not_publish_partial_configuration(self):
        def fail(directory):
            private_file(directory / "jwt_private_key.pem", "partial")
            raise RuntimeError("external key operation failed")

        with self.assertRaises(RuntimeError):
            generate(self.root, "http://localhost:3000", 1001, 1001, fail)
        self.assertFalse((self.root / ".env").exists())
        self.assertFalse((self.root / "secrets").exists())
        self.assertEqual(list(self.root.iterdir()), [])

    def test_root_generation_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "non-root"):
            generate(self.root, "http://localhost:3000", 0, 0, self.keys)

    @unittest.skipUnless(os.name == "posix", "POSIX file permissions")
    def test_private_files_are_owner_only(self):
        self.create()
        for relative in (".env", "secrets/database-admin.json", "secrets/user/jwt_private_key.pem"):
            self.assertEqual((self.root / relative).stat().st_mode & 0o777, 0o600)
        for relative in ("secrets", "secrets/user"):
            self.assertEqual((self.root / relative).stat().st_mode & 0o777, 0o700)

    def test_malformed_secret_state_is_rejected_before_sql(self):
        _, state = self.create()
        state["user"]["runtime_password"] = "quote';SELECT 1;"
        (self.root / "secrets/database-admin.json").write_text(json.dumps(state))
        with self.assertRaisesRegex(ValueError, "secret format"):
            load_database_secrets(self.root)


class OriginAndDiagnosticsTests(unittest.TestCase):
    def test_database_inventory_matches_existing_service_configs(self):
        for service, (port, _, _) in DATABASES.items():
            config = tomllib.loads(
                (REPOSITORY / f"{service}-service/supabase/config.toml").read_text()
            )
            with self.subTest(service=service):
                self.assertEqual(config["project_id"], PROJECT_IDS[service])
                self.assertEqual(config["db"]["port"], port)
                self.assertEqual(config["db"]["major_version"], 17)

    def test_only_https_or_private_localhost_origins_are_accepted(self):
        self.assertEqual(
            validate_origin("https://example.cloudfront.net/"), "https://example.cloudfront.net"
        )
        self.assertEqual(validate_origin("http://localhost:3000"), "http://localhost:3000")
        for value in (
            "http://example.com",
            "https://user:password@example.com",
            "https://example.com/path",
            "https://example.com?token=secret",
            "https://example.com/#fragment",
            "https://evil'host",
            "https://example.com:bad",
            "https://example.com\nEXTRA=value",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_origin(value)

    def test_failed_subprocess_details_are_not_in_operator_error(self):
        class Result:
            returncode = 1
            stdout = "password=should-not-leak"
            stderr = "postgresql://private:secret@database/"

        with self.assertRaises(ProvisionError) as caught:
            checked(Result(), "user", "migration")
        self.assertNotIn("should-not-leak", str(caught.exception))
        self.assertNotIn("postgresql", str(caught.exception))

    def test_safe_diagnostic_keeps_startup_cause_without_credentials(self):
        class Result:
            stdout = ""
            stderr = (
                "failed to inspect container health: docker: command not found\n"
                "Error: password='private password with spaces'\n"
                "Error: connect postgresql://private:secret@database/\n"
                "Error: ALTER ROLE sample PASSWORD 'hidden-sql-value';\n"
                "Error: value " + "a" * 64 + "\n"
            )

        diagnostic = safe_diagnostic(Result())
        # The summary is bounded; inspect each independent case too so the cause
        # cannot be accidentally hidden by later redaction markers.
        self.assertNotIn("private password", diagnostic)
        self.assertNotIn("postgresql://", diagnostic)
        self.assertNotIn("hidden-sql-value", diagnostic)
        self.assertNotIn("a" * 64, diagnostic)
        Result.stderr = "failed to inspect container health: docker: command not found"
        self.assertIn("docker: command not found", safe_diagnostic(Result()))

    def test_diagnostics_redact_tokens_private_keys_and_driver_urls(self):
        jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature"
        private_body = "unit-test-private-key-body"

        class Result:
            stdout = ""
            stderr = (
                "Error: " + jwt + "\n"
                "Error: -----BEGIN PRIVATE KEY-----\n" + private_body + "\n"
                "-----END PRIVATE KEY-----\n"
                "Error: postgresql+asyncpg://user:private-value@database/db\n"
                "Error: sb_secret_example01234567890123456789\n"
            )

        diagnostic = safe_diagnostic(Result())
        for value in (jwt, private_body, "private-value", "sb_secret_example01234567890123456789"):
            self.assertNotIn(value, diagnostic)


if __name__ == "__main__":
    unittest.main()
