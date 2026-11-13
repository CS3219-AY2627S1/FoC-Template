"""Contract tests for private-emulator provisioning; never contact a cloud API."""
import json
import os
from pathlib import Path
import runpy
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError


class LocalPubSubSetupTest(unittest.TestCase):
    script = Path(__file__).with_name("init.py")

    def test_creates_penalty_topics_without_credit_penalty_subscriptions(self):
        response = MagicMock()
        response.__enter__.return_value.status = 200
        with patch.dict(os.environ, {"PUBSUB_EMULATOR_HOST": "pubsub-emulator:8085"}, clear=True), \
                patch("urllib.request.urlopen", return_value=response) as request:
            runpy.run_path(str(self.script))
        calls = [call.args[0] for call in request.call_args_list]
        topics = {call.full_url.rsplit("/", 1)[-1] for call in calls if "/topics/" in call.full_url}
        self.assertEqual({"order-completion-local-v1", "open-order-refund-local-v1",
                          "courier-penalty-event-local-v1",
                          "courier-penalty-addition-local-v1",
                          "courier-penalty-deduction-local-v1", "user-created-local-v1",
                          "credit-command-compensation-local-v1",
                          "credit-command-compensation-result-local-v1"}, topics)
        subscriptions = [json.loads(call.data) for call in calls if "/subscriptions/" in call.full_url]
        self.assertEqual(5, len(subscriptions))
        self.assertEqual(2, sum("/order-events/" in item.get("pushConfig", {}).get("pushEndpoint", "") for item in subscriptions))
        self.assertTrue(all("penalty" not in item["topic"] for item in subscriptions))
        self.assertTrue(all(call.full_url.startswith("http://pubsub-emulator:8085/") for call in calls))

    def test_existing_topics_and_subscriptions_are_idempotent(self):
        conflict = HTTPError("http://pubsub-emulator:8085", 409, "exists", {}, None)
        with patch.dict(os.environ, {"PUBSUB_EMULATOR_HOST": "pubsub-emulator:8085"}, clear=True), \
                patch("urllib.request.urlopen", side_effect=conflict) as request:
            runpy.run_path(str(self.script))
        self.assertEqual(13, request.call_count)

    def test_rejects_non_private_host_before_network_access(self):
        with patch.dict(os.environ, {"PUBSUB_EMULATOR_HOST": "pubsub.googleapis.com"}, clear=True), \
                patch("urllib.request.urlopen") as request:
            with self.assertRaises(SystemExit):
                runpy.run_path(str(self.script))
        request.assert_not_called()


if __name__ == "__main__":
    unittest.main()
