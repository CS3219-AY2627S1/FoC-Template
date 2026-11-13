"""Exercise operational scripts against fake CLI responses; never contacts AWS."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]

FAKE_AWS = r'''#!/usr/bin/env python3
import json, os, pathlib, sys
args = sys.argv[1:]
record = {"args": args}
for option in ["--overrides", "--cli-input-json"]:
    if option in args:
        record[option] = json.loads(pathlib.Path(args[args.index(option)+1].removeprefix("file://")).read_text())
with open(os.environ["CALLS"], "a") as log:
    log.write(json.dumps(record)+"\n")
command = tuple(args[:2])
if command == ("ecs", "describe-services"):
    print("arn:task/current")
elif command == ("ecs", "describe-task-definition"):
    print(json.dumps({"taskDefinition": {"containerDefinitions": [{"name": "supplier", "image": "image:release", "restartPolicy": {"enabled": True}, "logConfiguration": {"options": {"awslogs-group": "/ecs/test/supplier"}}}, {"name": "user", "image": "image:release"}]}}))
elif command == ("ecs", "register-task-definition"):
    print("arn:task/setup")
elif command == ("ecs", "run-task"):
    print(json.dumps({"tasks": [{"taskArn": "arn:task/running"}], "failures": []}))
elif command == ("ecs", "describe-tasks"):
    print(json.dumps({"tasks": [{"containers": [{"name": os.environ.get("CONTAINER", "supplier-seed"), "exitCode": int(os.environ.get("EXIT_CODE", "0"))}]}]}))
elif command == ("ecs", "list-services"):
    print(json.dumps(["arn:aws:ecs:region:account:service/test/catalog", "arn:aws:ecs:region:account:service/test/stream"]))
elif command == ("ssm", "describe-parameters"):
    print(os.environ.get("PARAMETER_TYPE", "SecureString"))
elif command == ("sqs", "get-queue-attributes"):
    print(json.dumps({"ApproximateNumberOfMessages": os.environ.get("MESSAGES", "0"), "ApproximateNumberOfMessagesNotVisible": "0", "ApproximateNumberOfMessagesDelayed": "0"}))
'''


class OperationsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="foc-operations-")
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        self.calls = self.path / "calls"
        self.env = dict(os.environ, PATH=f"{self.path}:{os.environ['PATH']}", CALLS=str(self.calls), AWS_REGION="ap-southeast-1")
        for name, source in {
            "aws": FAKE_AWS,
            "terraform": '#!/bin/sh\ncat "$FIXTURE"\n',
        }.items():
            executable = self.path / name
            executable.write_text(source)
            executable.chmod(0o700)
        self.fixture = self.path / "deployment.json"
        self.fixture.write_text(json.dumps({
            "cluster": "test", "region": "ap-southeast-1",
            "setup_tasks": {
                "supplier-seed": {"service": "supplier", "task_definition": {"containerDefinitions": [{"name": "supplier-seed", "environment": [{"name": "SPRING_PROFILES_ACTIVE", "value": "prod,supplier-seed"}], "logConfiguration": {"options": {"awslogs-group": "/ecs/test/setup"}}}]}},
                "admin-init": {"service": "user", "task_definition": {"containerDefinitions": [{"name": "admin-init", "logConfiguration": {"options": {"awslogs-group": "/ecs/test/setup"}}}]}, "environment": {}},
            },
        }))
        self.env["FIXTURE"] = str(self.fixture)

    def run_script(self, name, *args, **env):
        return subprocess.run(["bash", str(ROOT / ".github/scripts" / name), *args], env=dict(self.env, **env), capture_output=True, text=True)

    def records(self):
        return [json.loads(line) for line in self.calls.read_text().splitlines()]

    def test_supplier_registers_oneoff_using_current_release_image(self):
        result = self.run_script("run-setup-task.sh", "supplier-seed")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.records()
        registration = next(c for c in calls if c["args"][:2] == ["ecs", "register-task-definition"])
        container = registration["--cli-input-json"]["containerDefinitions"][0]
        self.assertEqual(container["name"], "supplier-seed")
        self.assertEqual(container["image"], "image:release")
        self.assertNotIn("restartPolicy", container)
        self.assertEqual(container["environment"], [{"name": "SPRING_PROFILES_ACTIVE", "value": "prod,supplier-seed"}])
        run = next(c for c in calls if c["args"][:2] == ["ecs", "run-task"])
        self.assertIn("arn:task/setup", run["args"])
        self.assertNotIn("--overrides", run["args"])

    def test_admin_template_uses_release_image(self):
        result = self.run_script("run-setup-task.sh", "admin-init", CONTAINER="admin-init")
        self.assertEqual(result.returncode, 0, result.stderr)
        registration = next(c for c in self.records() if c["args"][:2] == ["ecs", "register-task-definition"])
        self.assertEqual(registration["--cli-input-json"]["containerDefinitions"][0]["image"], "image:release")

    def test_failed_setup_and_unknown_task_fail(self):
        self.assertNotEqual(self.run_script("run-setup-task.sh", "supplier-seed", EXIT_CODE="1").returncode, 0)
        self.assertNotEqual(self.run_script("run-setup-task.sh", "unknown").returncode, 0)

    def test_toggle_discovers_service_names(self):
        result = self.run_script("toggle-services.sh", "stop")
        self.assertEqual(result.returncode, 0, result.stderr)
        updates = [c["args"] for c in self.records() if c["args"][:2] == ["ecs", "update-service"]]
        self.assertEqual({a[a.index("--service") + 1] for a in updates}, {"catalog", "stream"})
        self.assertTrue(all(a[a.index("--desired-count") + 1] == "0" for a in updates))

    def test_plan_rejects_nonempty_queues_and_missing_secrets(self):
        plan = self.path / "plan.json"
        plan.write_text(json.dumps({"planned_values": {"outputs": {"deployment": {"value": {"region": "ap-southeast-1"}}, "required_ssm_parameters": {"value": ["test-token"]}}}, "resource_changes": [{"type": "aws_sqs_queue", "change": {"actions": ["delete"], "before": {"url": "https://queue"}}}]}))
        self.assertEqual(self.run_script("check-infrastructure-plan.sh", str(plan)).returncode, 0)
        self.assertNotEqual(self.run_script("check-infrastructure-plan.sh", str(plan), MESSAGES="1").returncode, 0)
        self.assertNotEqual(self.run_script("check-infrastructure-plan.sh", str(plan), PARAMETER_TYPE="None").returncode, 0)


if __name__ == "__main__":
    unittest.main()
