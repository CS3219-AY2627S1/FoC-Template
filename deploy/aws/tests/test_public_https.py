# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-02, 2026-11-03
# Scope: Implemented and debugged CloudFront request generation and ingress configuration tests.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from cloud_config import ROOT, read_environment
from generate_env import generate, private_file
from public_https import (
    distribution_config,
    set_origin,
    validate_public_origin,
    write_distribution,
)
from validate import validate


def test_keys(directory):
    private_file(directory / "jwt_private_key.pem", "throwaway-test-key")
    private_file(directory / "jwt_public_key.pem", "throwaway-test-key")


class PublicConfigurationTests(unittest.TestCase):
    def test_distribution_preserves_authenticated_mutations_and_retries(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "request.json"
            write_distribution(path, "ec2-54-179-16-136.ap-southeast-1.compute.amazonaws.com")
            saved = path.read_bytes()
            config = json.loads(saved)
            behavior = config["DefaultCacheBehavior"]
            self.assertEqual(behavior["ViewerProtocolPolicy"], "redirect-to-https")
            self.assertEqual(behavior["CachePolicyId"], "4135ea2d-6df8-44a3-9df3-4b5a84be39ad")
            self.assertEqual(
                behavior["OriginRequestPolicyId"], "216adef6-5c7f-47e4-b989-5492eafa07d3"
            )
            self.assertEqual(
                set(behavior["AllowedMethods"]["Items"]),
                {"GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"},
            )
            self.assertTrue(
                all(
                    item["ErrorCachingMinTTL"] == 0
                    for item in config["CustomErrorResponses"]["Items"]
                )
            )
            self.assertNotIn("ResponsePagePath", str(config))
            with self.assertRaises(FileExistsError):
                write_distribution(path, "ec2-54-179-16-136.ap-southeast-1.compute.amazonaws.com")
            self.assertEqual(path.read_bytes(), saved)

    def test_invalid_or_unexpected_origin_hosts_are_rejected(self):
        for hostname in (
            "localhost",
            "https://example.com",
            "example.com:8080",
            "ec2-999-1-1-1.ap-southeast-1.compute.amazonaws.com",
            "ec2-1-2-3-4.ap-southeast-2.compute.amazonaws.com",
        ):
            with self.subTest(hostname=hostname), self.assertRaises(ValueError):
                distribution_config(hostname)
        for value in (
            "http://dexample.cloudfront.net",
            "https://example.com",
            "https://dexample.cloudfront.net:443",
            "https://dexample.cloudfront.net/path",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_public_origin(value)

    @unittest.skipUnless(os.name == "posix", "EC2 environment update requires POSIX")
    def test_origin_update_preserves_every_secret_and_is_repeatable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            generate(root, "http://localhost:3000", 1001, 1001, test_keys)
            before = read_environment(root / ".env")
            state = {
                path.relative_to(root): path.read_bytes()
                for path in (root / "secrets").rglob("*")
                if path.is_file()
            }
            with patch("public_https.os.getuid", return_value=1001):
                set_origin(root, "https://dexample.cloudfront.net")
                set_origin(root, "https://dexample.cloudfront.net")
            after = read_environment(root / ".env")
            self.assertEqual(after.pop("FOC_PUBLIC_ORIGIN"), "https://dexample.cloudfront.net")
            before.pop("FOC_PUBLIC_ORIGIN")
            self.assertEqual(before, after)
            self.assertEqual(
                state,
                {
                    path.relative_to(root): path.read_bytes()
                    for path in (root / "secrets").rglob("*")
                    if path.is_file()
                },
            )
            self.assertEqual((root / ".env").stat().st_mode & 0o777, 0o600)


def render_compose_configs():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        generate(root, "https://dexample.cloudfront.net", 1001, 1001, test_keys)
        command = [
            "docker",
            "compose",
            "--env-file",
            str(root / ".env"),
            "-f",
            str(ROOT / "compose.yaml"),
        ]
        configs = {}
        for mode in ("private", "public"):
            files = ["-f", str(ROOT / "compose.public.yaml")] if mode == "public" else []
            result = subprocess.run(
                [*command, *files, "--profile", "*", "config", "--format", "json"],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode:
                raise RuntimeError("Disposable Compose parsing failed; resolved output suppressed.")
            configs[mode] = json.loads(result.stdout)
        return configs


@unittest.skipUnless(
    os.environ.get("CLOUD_COMPOSE_SMOKE") == "1", "real Docker Compose config parser"
)
class ComposeIngressTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.configs = render_compose_configs()

    def test_both_modes_render_and_require_explicit_public_selection(self):
        validate(self.configs["private"])
        validate(self.configs["public"], public=True)
        with self.assertRaises(ValueError):
            validate(self.configs["public"])
        with self.assertRaises(ValueError):
            validate(self.configs["private"], public=True)

    def test_public_mode_rejects_other_exposed_ports_and_missing_private_access(self):
        for service in ("user-service", "rabbitmq", "mailpit"):
            config = copy.deepcopy(self.configs["public"])
            config["services"][service].setdefault("ports", []).append(
                {"host_ip": "0.0.0.0", "published": "5432", "target": 5432}
            )
            with self.subTest(service=service), self.assertRaises(ValueError):
                validate(config, public=True)
        config = copy.deepcopy(self.configs["public"])
        config["services"]["web-client"]["ports"] = []
        with self.assertRaises(ValueError):
            validate(config, public=True)

    def test_public_mode_requires_exact_browser_origin_and_listener(self):
        config = copy.deepcopy(self.configs["public"])
        config["services"]["chat-service"]["environment"]["ALLOWED_ORIGINS"] = (
            '["http://localhost:3000"]'
        )
        with self.assertRaises(ValueError):
            validate(config, public=True)
        config = copy.deepcopy(self.configs["public"])
        config["services"]["web-client"]["volumes"] = []
        with self.assertRaises(ValueError):
            validate(config, public=True)


if __name__ == "__main__":
    unittest.main()
