"""Credential-free checks for profile isolation; no SSO login or AWS calls."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
HELPER = ROOT / "deploy" / "aws-env.sh"
CREDENTIAL_OVERRIDES = (
    "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
    "AWS_SECURITY_TOKEN", "AWS_CREDENTIAL_FILE", "AWS_DEFAULT_PROFILE", "AWS_WEB_IDENTITY_TOKEN_FILE",
    "AWS_ROLE_ARN", "AWS_ROLE_SESSION_NAME", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
    "AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_CONTAINER_AUTHORIZATION_TOKEN",
    "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
)
ENDPOINT_OVERRIDES = ("AWS_ENDPOINT_URL", "AWS_ENDPOINT_URL_STS", "AWS_ENDPOINT_URL_SECRETS_MANAGER")


class AwsEnvironmentTests(unittest.TestCase):
    def source(self, extra_env=None):
        env = os.environ.copy()
        env.update(extra_env or {})
        names = list(CREDENTIAL_OVERRIDES + ENDPOINT_OVERRIDES) + [
            "AWS_PROFILE", "AWS_CONFIG_FILE", "AWS_SHARED_CREDENTIALS_FILE",
            "AWS_EC2_METADATA_DISABLED", "AWS_REGION", "AWS_DEFAULT_REGION", "BOTO_CONFIG",
        ]
        script = (
            'source "$1" || exit $?\n'
            'python3 -c \'import json, os, sys; '
            'print(json.dumps({k: os.environ.get(k) for k in sys.argv[1:]}))\' '
            + " ".join(names)
        )
        with tempfile.TemporaryDirectory() as elsewhere:
            result = subprocess.run(
                ["bash", "-c", script, "bash", str(HELPER)],
                cwd=elsewhere, env=env, text=True, capture_output=True,
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout), result

    def test_selects_local_profile_and_clears_competing_settings(self):
        overrides = dict.fromkeys(CREDENTIAL_OVERRIDES + ENDPOINT_OVERRIDES, "SENTINEL_DO_NOT_PRINT")
        overrides.update(
            AWS_PROFILE="another-account", AWS_REGION="us-east-1", AWS_DEFAULT_REGION="us-west-2",
            AWS_CONFIG_FILE="/nonexistent/config", AWS_SHARED_CREDENTIALS_FILE="/nonexistent/credentials",
            BOTO_CONFIG="/nonexistent/boto.cfg",
        )
        values, result = self.source(overrides)
        self.assertEqual(values["AWS_CONFIG_FILE"], str(ROOT / ".aws-local" / "config"))
        self.assertEqual(values["AWS_SHARED_CREDENTIALS_FILE"], str(ROOT / ".aws-local" / "credentials"))
        self.assertEqual(values["AWS_PROFILE"], "foc-demo")
        self.assertEqual(values["AWS_EC2_METADATA_DISABLED"], "true")
        self.assertEqual(values["BOTO_CONFIG"], "/dev/null")
        for name in CREDENTIAL_OVERRIDES + ENDPOINT_OVERRIDES + ("AWS_REGION", "AWS_DEFAULT_REGION"):
            self.assertIsNone(values[name], name)
        self.assertNotIn("SENTINEL_DO_NOT_PRINT", result.stdout + result.stderr)

    def test_executing_instead_of_sourcing_explains_usage(self):
        result = subprocess.run(["bash", str(HELPER)], text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("source", result.stderr)
        self.assertIn("deploy/aws-env.sh", result.stderr)


if __name__ == "__main__":
    unittest.main()
