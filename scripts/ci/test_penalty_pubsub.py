"""Unified local penalty stream contract. All HTTP requests are intercepted."""
import json
import os
from pathlib import Path
import runpy
import subprocess
import tempfile
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[2]
FAKE_GCLOUD = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
state = Path(os.environ["FAKE_STATE"])
data = json.loads(state.read_text())
data["calls"].append(args)
if "--project" in args:
    index = args.index("--project")
    del args[index:index+2]
args = [arg for arg in args if arg != "--quiet"]
result = 0
if args[:2] == ["pubsub", "subscriptions"]:
    name = args[3]
    if args[2] == "describe":
        subscription = data["subscriptions"].get(name)
        if subscription is None:
            result = 1
        elif any("enableMessageOrdering" in arg for arg in args):
            print(str(subscription["ordered"]).lower())
        else:
            print("projects/protean-vigil-509704-q4/topics/" + subscription["topic"])
    elif args[2] == "create":
        data["subscriptions"][name] = {
            "topic": args[args.index("--topic")+1], "ordered": "--enable-message-ordering" in args}
state.write_text(json.dumps(data))
sys.exit(result)
'''


class PenaltyCloudProvisioningTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name)
        cli = self.path / "gcloud"
        cli.write_text(FAKE_GCLOUD)
        cli.chmod(0o755)
        self.state = self.path / "state.json"
        self.state.write_text(json.dumps({"subscriptions": {}, "calls": []}))
        self.environment = {**os.environ, "PATH": str(self.path)+os.pathsep+os.environ["PATH"],
                            "FAKE_STATE": str(self.state)}

    def run_script(self):
        return subprocess.run(["bash", str(ROOT / "infra/gcp/configure-user-pubsub.sh"), "staging"],
                              env=self.environment, capture_output=True, text=True)

    def test_provisions_ordered_unified_subscription_and_preserves_legacy_on_rerun(self):
        for _ in range(2):
            result = self.run_script()
            self.assertEqual(0, result.returncode, result.stderr)
        data = json.loads(self.state.read_text())
        self.assertEqual(3, len(data["subscriptions"]))
        unified = data["subscriptions"]["user-courier-penalty-event-dev-v1"]
        self.assertTrue(unified["ordered"])
        self.assertEqual("courier-penalty-event-dev-v1", unified["topic"])
        creates = [call for call in data["calls"] if "create" in call and "subscriptions" in call]
        self.assertEqual(3, len(creates))
        self.assertTrue(any("https://user-service-staging-374055363871.asia-southeast1.run.app/api/users/internal/penalties/events"
                            in call for call in creates))

    def test_rejects_existing_unordered_subscription_without_recreating_backlog(self):
        self.assertEqual(0, self.run_script().returncode)
        data = json.loads(self.state.read_text())
        data["subscriptions"]["user-courier-penalty-event-dev-v1"]["ordered"] = False
        data["calls"] = []
        self.state.write_text(json.dumps(data))
        result = self.run_script()
        self.assertNotEqual(0, result.returncode)
        self.assertIn("do not recreate", result.stderr)
        self.assertFalse(any("delete" in call or "create" in call
                             for call in json.loads(self.state.read_text())["calls"]))


class PenaltyBootstrapTest(unittest.TestCase):
    def test_one_ordered_user_subscription_retains_legacy_drain_routes(self):
        root = Path(__file__).resolve().parents[2]
        response = MagicMock()
        response.__enter__.return_value.status = 200
        with patch.dict(os.environ, {"PUBSUB_EMULATOR_HOST": "pubsub-emulator:8085"}, clear=True), \
                patch("urllib.request.urlopen", return_value=response) as request:
            runpy.run_path(str(root / "infra/pubsub-emulator-init.py"))
        requests = [call.args[0] for call in request.call_args_list]
        unified = [json.loads(call.data) for call in requests
                   if call.full_url.endswith("/subscriptions/user-courier-penalty-event-local-v1")]
        self.assertEqual(1, len(unified))
        self.assertTrue(unified[0]["enableMessageOrdering"])
        self.assertEqual("projects/demo-foc-local/topics/courier-penalty-event-local-v1", unified[0]["topic"])
        self.assertEqual("http://user-service:8080/api/users/internal/penalties/events",
                         unified[0]["pushConfig"]["pushEndpoint"])
        for direction in ("addition", "deduction"):
            self.assertTrue(any(call.full_url.endswith(f"/subscriptions/user-courier-penalty-{direction}-local-v1")
                                for call in requests))
        self.assertTrue(all(call.full_url.startswith("http://pubsub-emulator:8085/") for call in requests))

    def test_cannot_point_initializer_at_cloud(self):
        root = Path(__file__).resolve().parents[2]
        with patch.dict(os.environ, {"PUBSUB_EMULATOR_HOST": "pubsub.googleapis.com"}, clear=True), \
                patch("urllib.request.urlopen") as request:
            with self.assertRaises(SystemExit):
                runpy.run_path(str(root / "infra/pubsub-emulator-init.py"))
        request.assert_not_called()


if __name__ == "__main__":
    unittest.main()
