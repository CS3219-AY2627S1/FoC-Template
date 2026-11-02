"""Executable cloud-wiring tests; uses a fake gcloud, never cloud credentials."""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest
from test_report_pubsub import ReportCloudWorkflowTest

ROOT = Path(__file__).resolve().parents[2]
FAKE = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
a = sys.argv[1:]
for flag in ("--project",):
    if flag in a:
        i=a.index(flag); del a[i:i+2]
a=[v for v in a if v!="--quiet"]
state=Path(os.environ["FAKE_STATE"])
d=json.loads(state.read_text()) if state.exists() else {"topics": [], "subscriptions": {}, "calls": []}
d["calls"].append(a)
result=0
def value(flag): return a[a.index(flag)+1]
if a[:2]==["pubsub","topics"]:
    if a[2]=="describe": result=0 if a[3] in d["topics"] else 1
    elif a[2]=="create" and a[3] not in d["topics"]: d["topics"].append(a[3])
elif a[:2]==["pubsub","subscriptions"]:
    if a[2]=="describe":
        result=0 if a[3] in d["subscriptions"] else 1
        if not result: print("projects/protean-vigil-509704-q4/topics/"+d["subscriptions"][a[3]])
    elif a[2]=="create": d["subscriptions"][a[3]]=value("--topic")
state.write_text(json.dumps(d))
sys.exit(result)
'''


class CloudWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        cli = self.directory / "gcloud"
        cli.write_text(FAKE)
        cli.chmod(0o755)
        self.state = self.directory / "state.json"
        self.env = dict(os.environ, PATH=str(self.directory) + os.pathsep + os.environ["PATH"],
                        FAKE_STATE=str(self.state))

    def provision(self, environment, ok=True):
        result = subprocess.run(["bash", str(ROOT / "infra/gcp/configure-compensation-pubsub.sh"), environment],
                                env=self.env, text=True, capture_output=True)
        if ok:
            self.assertEqual(0, result.returncode, result.stderr + result.stdout)
        else:
            self.assertNotEqual(0, result.returncode)
        return json.loads(self.state.read_text()), result

    def test_dev_is_isolated_and_idempotent(self):
        state, _ = self.provision("dev")
        again, _ = self.provision("dev")
        self.assertEqual(state["topics"], again["topics"])
        self.assertEqual({"credit-command-compensation-dev-v1", "credit-command-compensation-result-dev-v1"},
                         set(state["topics"]))
        self.assertEqual({}, again["subscriptions"])

    def test_staging_and_production_push_auth_dlq_and_replay(self):
        for environment, suffix in [("staging", "staging"), ("production", "prod")]:
            with self.subTest(environment=environment):
                state, _ = self.provision(environment)
                again, _ = self.provision(environment)
                sub = "order-credit-compensation-result-" + suffix + "-v1"
                topic = "credit-command-compensation-result-" + suffix + "-v1"
                self.assertEqual(topic, state["subscriptions"][sub])
                self.assertEqual(state["subscriptions"], again["subscriptions"])
                creates = [x for x in again["calls"] if x[:3] == ["pubsub", "subscriptions", "create"] and x[3] == sub]
                self.assertEqual(1, len(creates))
                args = creates[0]
                audience = "https://order-service-" + environment + "-374055363871.asia-southeast1.run.app"
                self.assertEqual(audience, args[args.index("--push-auth-token-audience")+1])
                self.assertEqual(audience + "/api/orders/internal/credit-compensations",
                                 args[args.index("--push-endpoint")+1])
                self.assertIn("--dead-letter-topic", args)
                self.assertIn("--push-auth-service-account", args)
                self.assertIn("order-compensations-dead-letter-" + suffix + "-v1-recovery", state["subscriptions"])
                self.assertTrue(any("roles/iam.serviceAccountTokenCreator" in x for x in again["calls"]))
                self.assertTrue(any("roles/pubsub.subscriber" in x for x in again["calls"]))
                # Both branches' input channels must survive the merge with the right topic/path.
                credit_url = "https://credit-service-" + environment + "-374055363871.asia-southeast1.run.app"
                for stem, topic_stem, route in [
                        ("credit-command-compensation", "credit-command-compensation", "command-compensations"),
                        ("credit-user-created", "user-created", "user-events/created")]:
                    source = stem + "-" + suffix + "-v1"
                    self.assertEqual(topic_stem + "-" + suffix + "-v1", state["subscriptions"][source])
                    creation = next(x for x in state["calls"]
                                    if x[:4] == ["pubsub", "subscriptions", "create", source])
                    self.assertEqual(credit_url + "/api/credits/internal/" + route,
                                     creation[creation.index("--push-endpoint") + 1])
                    self.assertEqual(credit_url, creation[creation.index("--push-auth-token-audience") + 1])

    def test_existing_wrong_topic_is_not_silently_rebound(self):
        state, _ = self.provision("staging")
        sub = "order-credit-compensation-result-staging-v1"
        state["subscriptions"][sub] = "wrong-topic"
        self.state.write_text(json.dumps(state))
        after, result = self.provision("staging", ok=False)
        self.assertIn("refusing to rebind", result.stderr)
        self.assertEqual("wrong-topic", after["subscriptions"][sub])

    def test_both_cloud_templates_enable_real_transport_and_private_boundaries(self):
        order = (ROOT / "order-service/deploy/env.yaml").read_text()
        credit = (ROOT / "credit-service/deploy/env.yaml").read_text()
        gateway = (ROOT / "gateway/templates/default.conf.template").read_text()
        self.assertIn('ORDER_COMPENSATION_ENABLED: "true"', order)
        self.assertIn('ORDER_COMMAND_RECOVERY_POLICY: "compensate"', order)
        self.assertIn('ORDER_AUTO_REPOST_ENABLED: "true"', order)
        user = (ROOT / "user-service/deploy/env.yaml").read_text()
        self.assertIn('ORDER_SERVICE_URL: "${ORDER_SERVICE_URL}"', user)
        self.assertIn('USER_CREATED_TOPIC: "${USER_CREATED_TOPIC}"', user)
        self.assertIn('CREDIT_USER_CREATED_SUBSCRIPTION: "${CREDIT_USER_CREATED_SUBSCRIPTION}"', credit)
        self.assertIn('CREDIT_COMPENSATION_SUBSCRIPTION: "${CREDIT_COMPENSATION_SUBSCRIPTION}"', credit)
        for environment in ("staging", "production"):
            env = (ROOT / ("infra/environments/" + environment + ".env")).read_text()
            self.assertIn("CREDIT_MESSAGING_MODE=google", env)
            self.assertIn("ORDER_COMPENSATION_RESULT_SUBSCRIPTION=", env)
            self.assertIn("ORDER_COMPENSATION_PUSH_SERVICE_ACCOUNT=", env)
        for location in ("/api/users/internal/", "/api/suppliers/internal/", "/api/orders/internal/users/",
                         "/api/credits/orders/", "/api/credits/commands/"):
            self.assertRegex(gateway, r"location \^~ " + re.escape(location) + r" \{[^}]*return 404")
        self.assertIn("location /api/credits/internal/", gateway)
        deploy = (ROOT / "scripts/ci/deploy.sh").read_text()
        self.assertIn("local INGRESS=internal", deploy)
        rollout = (ROOT / "scripts/ci/rollout-order-workflows.sh").read_text()
        self.assertLess(rollout.index('"$tag" gateway'), rollout.index('"$tag" user-service'))
        self.assertLess(rollout.index('configure-compensation-pubsub.sh "$environment"'),
                        rollout.index('"$tag" order-service'))

    def test_deployment_order_executes_gateway_and_providers_before_order(self):
        source = (ROOT / "scripts/ci/deploy.sh").read_text()
        block = source.split("ordered=()", 1)[1].split("render_env_file()", 1)[0]
        program = ('is_backend() { [[ $1 != frontend && $1 != gateway ]]; }; '
                   'services=("$@"); ordered=();\n' + block +
                   '\nprintf "%s\\n" "${ordered[@]}"')
        cases = [
            (["order-service", "credit-service", "supplier-service", "user-service", "gateway", "frontend"],
             ["gateway", "user-service", "supplier-service", "credit-service", "order-service", "frontend"]),
            (["order-service"], ["order-service"]),
            (["credit-service", "gateway", "frontend"], ["credit-service", "frontend", "gateway"]),
        ]
        for requested, expected in cases:
            result = subprocess.run(["bash", "-c", program, "test", *requested], text=True, capture_output=True)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual(expected, result.stdout.splitlines())


if __name__ == "__main__":
    unittest.main()
