"""Read-only local compensation wiring regressions; no database/cloud access."""
import json
import os
import runpy
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


class CompensationWiringTest(unittest.TestCase):
    def test_private_receiver_and_default_off_local_compose(self):
        compose = (ROOT.parent / "compose.yaml").read_text(encoding="utf-8")
        gateway = (ROOT.parent / "gateway/templates/default.conf.template").read_text(encoding="utf-8")
        self.assertIn("ORDER_COMPENSATION_ENABLED: ${ORDER_COMPENSATION_ENABLED:-false}", compose)
        self.assertIn("ORDER_COMMAND_RECOVERY_POLICY: ${ORDER_COMMAND_RECOVERY_POLICY:-retry}", compose)
        self.assertIn("ORDER_COMPENSATION_PUSH_MODE: emulator", compose)
        location = gateway.split("location = /api/orders/internal/credit-compensations {", 1)[1].split("}", 1)[0]
        self.assertIn("return 404", location)
        self.assertNotIn("proxy_pass", location)

    def test_local_initializer_retains_credit_and_adds_order_result_push(self):
        requests = {}

        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): return False

        def capture(request, **kwargs):
            requests[request.full_url] = json.loads(request.data)
            return Response()

        # Exercise the initializer actually mounted by the merged Compose file.
        script = ROOT.parent / "infra/pubsub-emulator-init.py"
        with patch.dict(os.environ, {"PUBSUB_EMULATOR_HOST": "pubsub-emulator:8085"}), patch(
                "urllib.request.urlopen", side_effect=capture):
            runpy.run_path(str(script))
        base = "http://pubsub-emulator:8085/v1/projects/demo-foc-local/subscriptions/"
        result = requests[base + "order-credit-compensation-result-local-v1"]
        self.assertEqual(result["pushConfig"]["pushEndpoint"],
                         "http://order-service:8080/api/orders/internal/credit-compensations")
        self.assertEqual(requests[base + "credit-command-compensation-local-v1"]["pushConfig"]["pushEndpoint"],
                         "http://credit-service:8080/api/credits/internal/command-compensations")
        self.assertNotIn("pushConfig", requests[base + "credit-compensation-results-test-local-v1"])
        self.assertEqual(requests[base + "credit-user-created-local-v1"]["pushConfig"]["pushEndpoint"],
                         "http://credit-service:8080/api/credits/internal/user-events/created")
        with patch.dict(os.environ, {"PUBSUB_EMULATOR_HOST": "cloud.example:8085"}), patch(
                "urllib.request.urlopen") as network:
            with self.assertRaises(SystemExit):
                runpy.run_path(str(script))
            network.assert_not_called()


if __name__ == "__main__":
    unittest.main()
