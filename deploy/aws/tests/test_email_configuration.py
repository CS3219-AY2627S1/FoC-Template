# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-03
# Scope: Implemented and debugged SMTP/SES cloud configuration tests.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import copy
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from cloud_config import read_environment
from configure_email import configure
from generate_env import generate, private_file
from test_public_https import render_compose_configs
from validate import validate


class EmailConfigurationTests(unittest.TestCase):
    @unittest.skipUnless(os.name == "posix", "EC2 environment updates require POSIX")
    def test_existing_environment_switch_preserves_credentials_and_can_restore_mailpit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def keys(path):
                private_file(path / "jwt_private_key.pem", "test-only-private-key")
                private_file(path / "jwt_public_key.pem", "test-only-public-key")

            generate(root, "https://dexample.cloudfront.net", 1001, 1001, keys)
            before = read_environment(root / ".env")
            state = {
                p.relative_to(root): p.read_bytes()
                for p in (root / "secrets").rglob("*")
                if p.is_file()
            }
            with patch("configure_email.os.getuid", return_value=1001):
                configure(root, "ses", "ap-southeast-1", "sender@example.com")
                configure(root, "ses", "ap-southeast-1", "sender@example.com")
                after = read_environment(root / ".env")
                assert after["OTP_EMAIL_PROVIDER"] == "ses"
                assert after["SES_FROM_ADDRESS"] == "sender@example.com"
                for key, value in before.items():
                    if key not in {"OTP_EMAIL_PROVIDER", "SES_REGION", "SES_FROM_ADDRESS"}:
                        self.assertEqual(after[key], value)
                configure(root, "smtp", "ap-southeast-1", None)
            self.assertEqual(read_environment(root / ".env")["OTP_EMAIL_PROVIDER"], "smtp")
            self.assertEqual(
                state,
                {
                    p.relative_to(root): p.read_bytes()
                    for p in (root / "secrets").rglob("*")
                    if p.is_file()
                },
            )
            self.assertEqual((root / ".env").stat().st_mode & 0o777, 0o600)

    def test_bad_sender_or_region_cannot_edit_existing_environment(self):
        for region, sender in (
            ("ap-southeast-1", "bad'\nKEY=value"),
            ("ap-southeast-1", "Display Name <sender@example.com>"),
            ("bad\nREGION=value", "sender@example.com"),
        ):
            with self.subTest(region=region), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / ".env").write_text("untouched\n")
                with self.assertRaises(ValueError):
                    configure(root, "ses", region, sender)
                self.assertEqual((root / ".env").read_text(), "untouched\n")


# Reuse actual parsed Compose data while retaining the opt-in runner boundary.
@unittest.skipUnless(
    os.environ.get("CLOUD_COMPOSE_SMOKE") == "1", "real Docker Compose config parser"
)
class EmailComposeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.configs = render_compose_configs()

    def test_current_cloud_defaults_remain_mailpit(self):
        environment = self.configs["public"]["services"]["user-service"]["environment"]
        self.assertEqual(environment["OTP_EMAIL_PROVIDER"], "smtp")
        self.assertEqual(environment["SMTP_HOST"], "mailpit")

    def test_ses_requires_sender_and_role_credentials(self):
        config = copy.deepcopy(self.configs["public"])
        environment = config["services"]["user-service"]["environment"]
        environment["OTP_EMAIL_PROVIDER"] = "ses"
        with self.assertRaises(ValueError):
            validate(config, public=True)
        environment["SES_FROM_ADDRESS"] = "sender@example.com"
        validate(config, public=True)
        environment["AWS_SECRET_ACCESS_KEY"] = "test-only-not-a-real-key"
        with self.assertRaises(ValueError):
            validate(config, public=True)


if __name__ == "__main__":
    unittest.main()
