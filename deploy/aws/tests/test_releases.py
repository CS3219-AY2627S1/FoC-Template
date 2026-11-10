# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-06
# Scope: Implemented and debugged release validation, deployment and rollback tests.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import copy
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from cloud_config import REPOSITORY
from deploy_release import ReleaseError, Releases, Runtime, atomic_json
from prepare_delivery import policies
from release_manifest import (
    APPLICATIONS,
    ARTIFACTS,
    checksum,
    compose_images,
    configuration,
    create_manifest,
    migrations,
    validate_manifest,
)
from release_migrations import POLICY, MigrationError
from release_workflow import WorkflowError, preflight, source_ci
from test_public_https import render_compose_configs

COMMIT = "a" * 40
ACCOUNT = "123456789012"


def release_manifest() -> dict:
    return {
        "version": 2,
        "release_id": f"{COMMIT[:12]}-100-1",
        "commit": COMMIT,
        "account_id": ACCOUNT,
        "region": "ap-southeast-1",
        "images": {
            name: f"{ACCOUNT}.dkr.ecr.ap-southeast-1.amazonaws.com/foc/{name}@sha256:{'1' * 64}"
            for name in ARTIFACTS
        },
        "configuration": configuration(),
        "migrations": migrations(),
        "migration_policy": checksum(REPOSITORY / POLICY),
    }


class FakeRuntime:
    """Exercise real release state/files; replace only the Docker/PostgreSQL boundary."""

    def __init__(self):
        self.containers = {
            name: {"image": "sha256:" + "2" * 64, "running": True}
            for name in (*APPLICATIONS, "rabbitmq", "mailpit")
        }
        self.calls = []
        self.fail_pull = False
        self.fail_readiness = 0
        self.versions = {
            service: sorted(name.split("_", 1)[0] for name in entries)
            for service, entries in migrations().items()
        }

    def database_versions(self):
        return self.versions

    @contextmanager
    def source(self, manifest, repo):
        if manifest["migrations"] != migrations(repo):
            raise ReleaseError("Source fingerprints differ from manifest.")
        yield repo

    def inspect(self):
        return copy.deepcopy(self.containers)

    def pull(self, manifest):
        self.calls.append("pull")
        if self.fail_pull:
            raise ReleaseError("pull failed")

    def apply(self, overlay, services):
        self.calls.append(("apply", json.loads(overlay.read_text()), services))

    def ready(self):
        self.calls.append("ready")
        if self.fail_readiness:
            self.fail_readiness -= 1
            raise ReleaseError("not ready")


class ReleaseManifestTests(unittest.TestCase):
    def test_manifest_requires_all_eight_source_ci_digest_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for artifact in ARTIFACTS:
                (root / f"{artifact}.json").write_text(
                    json.dumps({"artifact": artifact, "digest": "sha256:" + "1" * 64})
                )
            manifest = create_manifest(REPOSITORY, root, COMMIT, ACCOUNT, "100", "1")
            self.assertEqual(manifest, release_manifest())
            (root / "credit-service.json").unlink()
            with self.assertRaises(FileNotFoundError):
                create_manifest(REPOSITORY, root, COMMIT, ACCOUNT, "100", "1")

    def test_only_owned_repositories_and_immutable_digests_are_accepted(self):
        manifest = release_manifest()
        validate_manifest(manifest)
        for image in (
            "ubuntu:latest",
            manifest["images"]["order-service"].replace("@sha256:", ":"),
            manifest["images"]["order-service"].replace(ACCOUNT, "999999999999"),
            manifest["images"]["order-service"] + ";echo bad",
        ):
            bad = copy.deepcopy(manifest)
            bad["images"]["order-service"] = image
            with self.subTest(image=image), self.assertRaises(ValueError):
                validate_manifest(bad)

    def test_workers_use_the_owning_service_image_only(self):
        manifest = release_manifest()
        overlay = compose_images(manifest["images"])["services"]
        self.assertEqual(set(overlay), set(APPLICATIONS))
        self.assertEqual(overlay["order-service"], overlay["order-recovery"])
        self.assertEqual(overlay["credit-service"], overlay["credit-consumer"])
        self.assertNotIn("rabbitmq", overlay)
        self.assertNotIn("mailpit", overlay)

    def test_incomplete_or_secret_bearing_manifests_are_rejected(self):
        for alteration in (
            lambda x: x.update(env={"password": "never-accepted"}),
            lambda x: x["images"].pop("user-service"),
            lambda x: x["configuration"].update({"../../.env": "b" * 64}),
            lambda x: x.update(release_id="../../overwrite"),
        ):
            manifest = release_manifest()
            alteration(manifest)
            with self.assertRaises(ValueError):
                validate_manifest(manifest)


class DeploymentRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.env = self.root / ".env"
        self.env.write_text(
            "OPENAI_API_KEY='private-existing-test-value'\nDATABASE_URL='unchanged'\n"
        )
        self.original = self.env.read_bytes()
        self.runtime = FakeRuntime()
        self.release = Releases(self.root, REPOSITORY, self.runtime)
        self.release.baseline()

    def test_success_records_digest_release_and_preserves_environment(self):
        manifest = release_manifest()
        self.release.deploy(manifest)
        current = json.loads((self.release.state / "current.json").read_text())
        self.assertEqual(current["manifest"], manifest)
        previous = json.loads((self.release.state / "previous.json").read_text())
        self.assertEqual(set(previous["images"].values()), {"sha256:" + "2" * 64})
        self.assertEqual(self.env.read_bytes(), self.original)
        self.assertNotIn(
            "private-existing-test-value", (self.release.state / "history.jsonl").read_text()
        )

    def test_failed_rollout_restores_the_captured_images_and_reports_failure(self):
        self.runtime.fail_readiness = 1
        with self.assertRaisesRegex(ReleaseError, "previous application images restored"):
            self.release.deploy(release_manifest())
        applies = [call for call in self.runtime.calls if isinstance(call, tuple)]
        self.assertEqual(len(applies), 2)
        self.assertEqual(set(applies[-1][2]), set(APPLICATIONS))
        self.assertTrue(
            all(
                value["image"] == "sha256:" + "2" * 64
                for value in applies[-1][1]["services"].values()
            )
        )
        self.assertIn("rollback", json.loads((self.release.state / "current.json").read_text()))
        self.assertIn("ROLLED_BACK", (self.release.state / "history.jsonl").read_text())
        self.assertEqual(self.env.read_bytes(), self.original)

    def test_failed_rollback_never_reports_success(self):
        self.runtime.fail_readiness = 2
        with self.assertRaisesRegex(ReleaseError, "Rollout and rollback checks failed"):
            self.release.deploy(release_manifest())
        self.assertIn("ROLLBACK_FAILED", (self.release.state / "history.jsonl").read_text())
        self.assertFalse((self.release.state / "current.json").exists())

    def test_metadata_write_failure_also_restores_previous_images(self):
        failed = False

        def write(path, value):
            nonlocal failed
            if path.name == "current.json" and not failed:
                failed = True
                raise OSError("simulated write failure")
            return atomic_json(path, value)

        with patch("deploy_release.atomic_json", side_effect=write):
            with self.assertRaisesRegex(ReleaseError, "previous application images restored"):
                self.release.deploy(release_manifest())
        self.assertIn("rollback", json.loads((self.release.state / "current.json").read_text()))
        self.assertEqual(self.env.read_bytes(), self.original)

    def test_failed_image_pull_leaves_containers_untouched(self):
        self.runtime.fail_pull = True
        with self.assertRaises(ReleaseError):
            self.release.deploy(release_manifest())
        self.assertEqual(self.runtime.calls, ["pull"])
        self.assertFalse((self.release.state / "active.compose.json").exists())

    def test_configuration_and_schema_changes_fail_before_pulling_or_mutating(self):
        for field in ("configuration", "migrations"):
            bad = release_manifest()
            target = bad[field]
            if field == "migrations":
                target = target["order"]
            target[next(iter(target))] = "0" * 64
            with self.subTest(field=field), self.assertRaises(ReleaseError):
                self.release.deploy(bad)
        self.assertEqual(self.runtime.calls, [])

    def test_database_versions_must_match_the_service_migration_history(self):
        self.runtime.versions["credit"] = []
        with self.assertRaisesRegex(MigrationError, "migration versions differ"):
            self.release.deploy(release_manifest())
        self.assertEqual(self.runtime.calls, ["pull"])

    def test_explicit_rollback_uses_saved_images_and_preserves_secrets(self):
        self.release.deploy(release_manifest())
        target = (self.release.state / "previous.json").read_bytes()
        self.runtime.calls.clear()
        self.release.rollback()
        self.release.rollback()
        self.assertEqual((self.release.state / "previous.json").read_bytes(), target)
        self.assertFalse(any(call == "pull" for call in self.runtime.calls))
        self.assertEqual(self.env.read_bytes(), self.original)
        self.assertIn("ROLLBACK_DEPLOYED", (self.release.state / "history.jsonl").read_text())


class SourceAndPermissionTests(unittest.TestCase):
    def test_ssm_manifest_uses_parameter_length_limits_and_safe_alphabet(self):
        document = json.loads(
            (REPOSITORY / "deploy/aws/ssm/deploy-release.json").read_text(encoding="utf-8")
        )
        parameter = document["parameters"]["Manifest"]
        self.assertEqual(parameter["minChars"], 4)
        self.assertEqual(parameter["maxChars"], 60000)
        self.assertEqual(parameter["interpolationType"], "ENV_VAR")
        pattern = parameter["allowedPattern"]
        # SSM Agent's Go regex rejects counted repetitions above 1000.
        for count in re.findall(r"\d+", pattern):
            self.assertLessEqual(int(count), 1000)

        def accepted(value):
            return (
                parameter["minChars"] <= len(value) <= parameter["maxChars"]
                and re.fullmatch(pattern, value) is not None
            )

        for value in (parameter["default"], "A" * 60000, "aB09+/=="):
            self.assertTrue(accepted(value))
        for value in ("", "AAA", "A" * 60001, "AAAA\n", "$(id)", 'AAA"'):
            self.assertFalse(accepted(value))

    def test_database_timeout_does_not_expose_operator_password(self):
        password = "private-operator-password"
        timeout = subprocess.TimeoutExpired(
            ["docker", "exec", "--env", f"PGPASSWORD={password}"], 30
        )
        with (
            patch(
                "deploy_release.load_database_secrets",
                return_value={"user": {"admin_password": password}},
            ),
            patch("deploy_release.sql", side_effect=timeout),
        ):
            with self.assertRaises(ReleaseError) as captured:
                Runtime().database_versions()
        self.assertNotIn(password, str(captured.exception))
        self.assertIsNone(captured.exception.__cause__)

    def test_stale_or_failed_source_cannot_reach_cloud_deployment(self):
        with patch.dict(os.environ, GITHUB_REPOSITORY="owner/repo"):
            with patch("release_workflow.execute", return_value={"sha": "b" * 40}):
                with self.assertRaisesRegex(WorkflowError, "no longer main"):
                    source_ci(COMMIT)
            runs = {
                "workflow_runs": [
                    {
                        "head_sha": COMMIT,
                        "head_branch": "main",
                        "status": "completed",
                        "conclusion": "failure",
                    }
                ]
            }
            with patch("release_workflow.execute", side_effect=[{"sha": COMMIT}, runs]):
                with self.assertRaisesRegex(WorkflowError, "no successful push CI"):
                    source_ci(COMMIT)

    def test_stopped_instance_is_deferred_without_start_or_ssm_invocation(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.dict(
                os.environ,
                {
                    "FOC_AWS_ACCOUNT_ID": ACCOUNT,
                    "FOC_EC2_INSTANCE_ID": "i-" + "a" * 17,
                    "FOC_CLOUDFRONT_ID": "E1234567890",
                    "GITHUB_OUTPUT": str(Path(directory) / "outputs"),
                },
            ),
            patch("release_workflow.source_ci", return_value=42),
            patch(
                "release_workflow.aws",
                side_effect=[
                    {"Account": ACCOUNT},
                    {"Reservations": [{"Instances": [{"State": {"Name": "stopped"}}]}]},
                ],
            ) as cloud,
        ):
            self.assertFalse(preflight(COMMIT))
            self.assertEqual(cloud.call_count, 2)
            self.assertNotIn("start-instances", str(cloud.call_args_list))
            self.assertNotIn("send-command", str(cloud.call_args_list))

    def test_changed_ec2_dns_blocks_stale_cloudfront_origin_before_rollout(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.dict(
                os.environ,
                {
                    "FOC_AWS_ACCOUNT_ID": ACCOUNT,
                    "FOC_EC2_INSTANCE_ID": "i-" + "a" * 17,
                    "FOC_CLOUDFRONT_ID": "E1234567890",
                    "GITHUB_OUTPUT": str(Path(directory) / "outputs"),
                },
            ),
            patch("release_workflow.source_ci", return_value=42),
            patch(
                "release_workflow.aws",
                side_effect=[
                    {"Account": ACCOUNT},
                    {
                        "Reservations": [
                            {
                                "Instances": [
                                    {"State": {"Name": "running"}, "PublicDnsName": "new-ec2"}
                                ]
                            }
                        ]
                    },
                    {"InstanceInformationList": [{"PingStatus": "Online"}]},
                    {
                        "DistributionConfig": {
                            "Origins": {"Items": [{"Id": "foc-ec2", "DomainName": "old-ec2"}]}
                        }
                    },
                ],
            ),
        ):
            with self.assertRaisesRegex(WorkflowError, "CloudFront origin does not match"):
                preflight(COMMIT)

    def test_trust_is_exact_main_and_deployment_cannot_run_arbitrary_documents(self):
        subject = "repo:owner@123/repo@456:ref:refs/heads/main"
        result = policies(ACCOUNT, "i-" + "a" * 17, "E1234567890", subject)
        self.assertEqual(
            result["trust"]["Statement"][0]["Condition"]["StringEquals"][
                "token.actions.githubusercontent.com:sub"
            ],
            subject,
        )
        commands = next(
            item for item in result["deploy"]["Statement"] if item["Action"] == "ssm:SendCommand"
        )
        self.assertTrue(
            any(item.endswith(":document/FoC-DeployRelease") for item in commands["Resource"])
        )
        self.assertNotIn("AWS-RunShellScript", str(result))
        self.assertNotIn("ec2:StartInstances", str(result))
        for invalid in (
            subject.replace("main", "*"),
            subject.replace("main", "feature/test"),
            "repo:owner/repo:pull_request",
        ):
            with self.assertRaises(ValueError):
                policies(ACCOUNT, "i-" + "a" * 17, "E1234567890", invalid)


@unittest.skipUnless(
    os.environ.get("CLOUD_COMPOSE_SMOKE") == "1", "real Docker Compose config parser"
)
class ReleaseComposeTests(unittest.TestCase):
    def test_image_overlay_keeps_supporting_services_and_owned_worker_images(self):
        original = render_compose_configs()["public"]
        overlay = compose_images(release_manifest()["images"])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "base.json").write_text(json.dumps(original))
            (root / "images.json").write_text(json.dumps(overlay))
            parsed = subprocess.run(
                [
                    "docker",
                    "compose",
                    "-f",
                    str(root / "base.json"),
                    "-f",
                    str(root / "images.json"),
                    "--profile",
                    "*",
                    "config",
                    "--format",
                    "json",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(
                parsed.returncode, 0, "Image overlay did not parse; configuration suppressed."
            )
            rendered = json.loads(parsed.stdout)
        for name, settings in overlay["services"].items():
            self.assertEqual(rendered["services"][name]["image"], settings["image"])
        for service in ("rabbitmq", "mailpit"):
            self.assertEqual(rendered["services"][service], original["services"][service])


if __name__ == "__main__":
    unittest.main()
