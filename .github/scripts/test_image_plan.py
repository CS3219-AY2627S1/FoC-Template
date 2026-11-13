import os
from pathlib import Path
import subprocess
import tempfile
import re
import unittest
from unittest.mock import patch

import image_plan


class ImagePlanTests(unittest.TestCase):
    def test_each_service_selects_only_its_own_image(self):
        for service in image_plan.SERVICES:
            with self.subTest(service=service):
                self.assertEqual([service], image_plan.select_services([f"{service}/src/main/App.java"]))

    def test_frontend_dockerfile_and_ignore_changes_are_included(self):
        for path in ("frontend/src/main.tsx", "Dockerfile", ".dockerignore"):
            self.assertEqual(["user-service"], image_plan.select_services(["user-service/" + path]))

    def test_multiple_services_are_selected_once_in_stable_order(self):
        self.assertEqual(["supplier-service", "order-service"], image_plan.select_services([
            "order-service/pom.xml", "supplier-service/Dockerfile", "order-service/src/A.java"]))

    def test_workflow_and_publisher_changes_select_all_services(self):
        for path in (".github/workflows/ci.yml", ".github/scripts/image_plan.py",
                     "deploy/aws/terraform/staging-core/main.tf"):
            self.assertEqual(list(image_plan.SERVICES), image_plan.select_services([path]))

    def test_unrelated_docs_do_not_publish(self):
        self.assertEqual([], image_plan.select_services(["README.md", "deploy/k8s/README.md"]))
        self.assertEqual([], image_plan.select_services([]))

    def test_empty_plan_still_has_a_safe_matrix_value(self):
        self.assertEqual({"service": [image_plan.NO_IMAGE_SENTINEL]}, image_plan.service_matrix([]))
        self.assertEqual({"service": ["order-service"]},
                         image_plan.service_matrix(["order-service"]))

    def test_deployment_tag_and_service_documentation_changes_do_not_republish(self):
        self.assertEqual([], image_plan.select_services([
            "order-service/k8s/deployment.yaml", "user-service/README.md", "credit-service/AGENTS.md"]))
        self.assertEqual(["order-service"], image_plan.select_services([
            "order-service/k8s/deployment.yaml", "order-service/src/main/App.java"]))

    def test_tags_identify_commit_and_do_not_collide_on_rerun(self):
        sha = "a" * 40
        self.assertEqual(f"sha-{sha}-r123-1", image_plan.release_tag(sha, "123", "1"))
        self.assertNotEqual(image_plan.release_tag(sha, "123", "1"),
                            image_plan.release_tag(sha, "123", "2"))

    def test_invalid_tag_inputs_fail(self):
        for sha, run_id, attempt in (("main", "1", "1"), ("a" * 40, "0", "1"),
                                    ("a" * 40, "1", "1\ninjected=value")):
            with self.subTest(sha=sha, run_id=run_id, attempt=attempt):
                with self.assertRaises(ValueError):
                    image_plan.release_tag(sha, run_id, attempt)

    def test_missing_or_zero_base_rebuilds_all(self):
        self.assertIsNone(image_plan.changed_paths("0" * 40, "a" * 40))
        with patch("image_plan.subprocess.run", return_value=subprocess.CompletedProcess([], 1)):
            self.assertIsNone(image_plan.changed_paths("b" * 40, "a" * 40))

    def test_diff_uses_both_sides_of_renames_and_nul_delimiters(self):
        responses = [subprocess.CompletedProcess([], 0), subprocess.CompletedProcess([], 0,
            stdout=b"supplier-service/src/old.java\0order-service/src/new.java\0")]
        with patch("image_plan.subprocess.run", side_effect=responses) as run:
            paths = image_plan.changed_paths("b" * 40, "a" * 40)
        self.assertIn("--no-renames", run.call_args.args[0])
        self.assertEqual(["supplier-service", "order-service"], image_plan.select_services(paths))

    def test_git_diff_failure_is_not_treated_as_no_changes(self):
        with patch("image_plan.subprocess.run", side_effect=[subprocess.CompletedProcess([], 0),
                subprocess.CalledProcessError(1, "git diff")]):
            with self.assertRaises(subprocess.CalledProcessError):
                image_plan.changed_paths("b" * 40, "a" * 40)

    def test_deployment_diff_includes_changes_from_every_merge_parent(self):
        responses = [
            subprocess.CompletedProcess([], 0, stdout=b"parent-one parent-two\n"),
            subprocess.CompletedProcess([], 0, stdout=b"order-service/src/App.java\0"),
            subprocess.CompletedProcess([], 0, stdout=b"deploy/aws/k8s/staging/ingress.yaml\0"),
        ]
        with patch("image_plan.subprocess.run", side_effect=responses) as run:
            paths = image_plan.changed_paths_from_parents()
        self.assertEqual(["deploy/aws/k8s/staging/ingress.yaml", "order-service/src/App.java"], paths)
        self.assertEqual(3, run.call_count)
        self.assertEqual("parent-one", run.call_args_list[1].args[0][-2])
        self.assertEqual("parent-two", run.call_args_list[2].args[0][-2])

    def test_main_writes_machine_outputs_and_human_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "output"
            summary = Path(directory) / "summary"
            env = {"GITHUB_EVENT_NAME": "push", "GITHUB_REF": "refs/heads/main",
                   "GITHUB_SHA": "a" * 40, "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "1",
                   "GITHUB_OUTPUT": str(output), "GITHUB_STEP_SUMMARY": str(summary)}
            with patch.dict(os.environ, env, clear=True), \
                    patch("image_plan.changed_paths", return_value=["order-service/Dockerfile"]):
                image_plan.main()
            self.assertIn('matrix={"service":["order-service"]}', output.read_text())
            self.assertIn("has-images=true", output.read_text())
            self.assertIn("order-service", summary.read_text())

    def test_no_changes_writes_false_and_safe_matrix(self):
        with tempfile.TemporaryDirectory() as directory:
            env = {"GITHUB_EVENT_NAME": "push", "GITHUB_REF": "refs/heads/main",
                   "GITHUB_SHA": "a" * 40, "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "1",
                   "GITHUB_OUTPUT": str(Path(directory) / "output"),
                   "GITHUB_STEP_SUMMARY": str(Path(directory) / "summary")}
            with patch.dict(os.environ, env, clear=True), patch("image_plan.changed_paths", return_value=[]):
                image_plan.main()
            self.assertIn('matrix={"service":["no-image"]}',
                          Path(env["GITHUB_OUTPUT"]).read_text())
            self.assertIn("has-images=false", Path(env["GITHUB_OUTPUT"]).read_text())

    def test_pr_and_non_main_events_are_rejected_before_git_or_outputs(self):
        for event, ref in (("pull_request", "refs/pull/1/merge"),
                           ("push", "refs/heads/feature"), ("workflow_dispatch", "refs/heads/main")):
            with self.subTest(event=event), patch.dict(os.environ,
                    {"GITHUB_EVENT_NAME": event, "GITHUB_REF": ref}, clear=True), \
                    patch("image_plan.changed_paths") as diff:
                with self.assertRaises(ValueError):
                    image_plan.main()
                diff.assert_not_called()


class WorkflowPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = (Path(__file__).resolve().parents[1] / "workflows/ci.yml").read_text()
        cls.gate = cls.workflow.split("\n  ci-gate:\n", 1)[1].split("\n  publish-images:\n", 1)[0]
        cls.publisher = cls.workflow.split("\n  publish-images:\n", 1)[1]

    def test_gate_waits_for_every_check_and_publisher_waits_for_gate(self):
        jobs = set(re.findall(r"^  ([a-z][a-z0-9-]*):$", self.workflow.split("\njobs:\n", 1)[1],
                              flags=re.MULTILINE))
        gate_dependencies = set(re.findall(r"^      - ([a-z][a-z0-9-]*)$", self.gate,
                                           flags=re.MULTILINE))
        publisher_dependencies = set(re.findall(r"^      - ([a-z][a-z0-9-]*)$",
                                                self.publisher.split("    if:", 1)[0],
                                                flags=re.MULTILINE))
        self.assertEqual(jobs - {"image-plan", "ci-gate", "publish-images"}, gate_dependencies)
        self.assertEqual({"ci-gate", "image-plan"}, publisher_dependencies)

    def test_publish_guard_is_main_push_and_nonempty_plan_without_bypass(self):
        guard = self.publisher.split("    runs-on:", 1)[0]
        self.assertIn("github.event_name == 'push'", guard)
        self.assertIn("github.ref == 'refs/heads/main'", guard)
        self.assertIn("needs.image-plan.outputs.has-images == 'true'", guard)
        self.assertNotIn("always()", guard)

    def test_each_publish_attempt_uses_current_context_not_cached_plan_tag(self):
        tag = "sha-${{ github.sha }}-r${{ github.run_id }}-${{ github.run_attempt }}"
        self.assertIn("tags: arkanian4/foc-${{ matrix.service }}:" + tag, self.publisher)
        self.assertIn("IMAGE: arkanian4/foc-${{ matrix.service }}:" + tag, self.publisher)
        self.assertNotIn("needs.image-plan.outputs.tag", self.publisher)

    def test_no_deployment_or_git_write_permissions(self):
        self.assertNotIn("kubectl", self.publisher)
        self.assertNotIn("contents: write", self.workflow)
        self.assertNotIn("pull_request_target", self.workflow)
        self.assertIn("linux/amd64", self.publisher)
        self.assertIn('"$GITHUB_STEP_SUMMARY"', self.publisher)


if __name__ == "__main__":
    unittest.main()
