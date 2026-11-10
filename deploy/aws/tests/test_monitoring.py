# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-08, 2026-11-09
# Scope: Implemented and debugged monitoring collection, alarms and Docker readiness tests.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from cloud_config import REPOSITORY
from install_monitoring import identity_matches, write_file
from monitor_runtime import (
    APPLICATION_NAMES,
    EXPECTED,
    HEALTH_CHECKED,
    INSPECT_FORMAT,
    LOG_GROUP,
    NAMESPACE,
    PUBLIC_ROUTES,
    SUPPORT_NAMES,
    MonitoringError,
    container_states,
    execute,
    main,
    memory_percent,
    public_routes,
    publish,
    save_state,
    snapshot,
    validate_config,
)

CONFIG = {
    "account_id": "123456789012",
    "instance_id": "i-" + "a" * 17,
    "region": "ap-southeast-1",
    "public_origin": "https://dexample.cloudfront.net",
}


def healthy_states():
    return {
        name: {
            "name": name,
            "running": True,
            "health": "healthy" if workload in HEALTH_CHECKED else None,
            "restarts": 0,
        }
        for name, workload in EXPECTED.items()
    }


def wait_for_container(name: str, timeout: float = 90) -> dict:
    """SQL readiness can precede Docker's first successful health-check sample."""
    expected_health = "healthy" if EXPECTED[name] in HEALTH_CHECKED else None
    deadline = time.monotonic() + timeout
    while True:
        state = container_states().get(name)
        if state and state["running"] and state["health"] == expected_health:
            return state
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            details = (
                f"running={state['running']}, health={state['health']}" if state else "missing"
            )
            raise AssertionError(f"{name} did not become ready within {timeout:g}s ({details}).")
        time.sleep(min(2, remaining))


class RuntimeMonitoringTests(unittest.TestCase):
    def test_docker_readiness_waits_for_starting_to_become_healthy(self):
        name = "supabase_db_user-service"
        healthy = healthy_states()[name]
        starting = {**healthy, "health": "starting"}
        with (
            patch(
                "test_monitoring.container_states", side_effect=[{name: starting}, {name: healthy}]
            ) as inspect,
            patch("test_monitoring.time.sleep") as sleep,
        ):
            self.assertEqual(wait_for_container(name), healthy)
        self.assertEqual(inspect.call_count, 2)
        sleep.assert_called_once()

    def test_docker_readiness_timeout_does_not_accept_a_still_starting_container(self):
        name = "supabase_db_user-service"
        starting = {**healthy_states()[name], "health": "starting"}
        with (
            patch("test_monitoring.container_states", return_value={name: starting}),
            patch("test_monitoring.time.monotonic", side_effect=[0, 91]),
            patch("test_monitoring.time.sleep") as sleep,
        ):
            with self.assertRaisesRegex(AssertionError, "within 90s.*health=starting"):
                wait_for_container(name)
        sleep.assert_not_called()

    @unittest.skipUnless(os.name == "posix", "real Linux memory/filesystem collection")
    def test_dry_run_reads_host_counters_without_publishing_or_writing_state(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            original = json.dumps(CONFIG)
            path.write_text(original)
            output = io.StringIO()
            with (
                patch("sys.argv", ["monitor_runtime", "--config", str(path), "--dry-run"]),
                patch("monitor_runtime.container_states", return_value=healthy_states()),
                patch("monitor_runtime.public_routes", return_value=PUBLIC_ROUTES),
                patch("monitor_runtime.publish") as remote,
                patch("monitor_runtime.save_state") as save,
                patch("sys.stdout", output),
            ):
                main()
            self.assertEqual(path.read_text(), original)
            self.assertEqual(list(Path(directory).iterdir()), [path])
            remote.assert_not_called()
            save.assert_not_called()
            result = json.loads(output.getvalue())
            self.assertEqual(result["metrics"]["ApplicationUnhealthyCount"], 0)
            self.assertGreaterEqual(result["metrics"]["MemoryUsedPercent"], 0)
            self.assertLessEqual(result["metrics"]["RootDiskUsedPercent"], 100)

    def test_only_expected_target_and_https_cloudfront_origin_are_accepted(self):
        self.assertEqual(validate_config(CONFIG), CONFIG)
        for field, value in (
            ("account_id", "123"),
            ("instance_id", "i-abc"),
            ("region", "ap-southeast-2"),
            ("public_origin", "http://169.254.169.254"),
            ("public_origin", "https://dexample.cloudfront.net@attacker.example"),
            ("public_origin", "https://dexample.cloudfront.net/?token=secret"),
            ("public_origin", "https://dexample.cloudfront.net\n"),
        ):
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                validate_config({**CONFIG, field: value})
        with self.assertRaises(ValueError):
            validate_config({**CONFIG, "OPENAI_API_KEY": "never-read-this"})

    def test_memory_uses_available_memory_not_free_memory(self):
        self.assertEqual(
            memory_percent("MemTotal: 1000 kB\nMemFree: 10 kB\nMemAvailable: 400 kB\n"), 60
        )
        for text in (
            "MemTotal: 0 kB\nMemAvailable: 0 kB",
            "MemTotal: 100 kB\nMemAvailable: 101 kB",
        ):
            with self.assertRaises(ValueError):
                memory_percent(text)

    def test_worker_without_healthcheck_is_healthy_but_api_without_one_is_not(self):
        states = healthy_states()
        result = snapshot(CONFIG, states, {}, 20, 30, PUBLIC_ROUTES)
        self.assertEqual(result["issues"], [])
        self.assertEqual(len(APPLICATION_NAMES), 14)
        self.assertEqual(len(SUPPORT_NAMES), 8)
        states["foc-cloud-order-service-1"]["health"] = None
        result = snapshot(CONFIG, states, {}, 20, 30, PUBLIC_ROUTES)
        self.assertEqual(result["metrics"]["ApplicationUnhealthyCount"], 1)
        self.assertEqual(result["issues"][0]["workload"], "order-service")

    def test_missing_database_and_failed_worker_have_separate_counts(self):
        states = healthy_states()
        del states["supabase_db_order-service"]
        states["foc-cloud-order-outbox-1"]["running"] = False
        result = snapshot(CONFIG, states, {}, 10, 20, PUBLIC_ROUTES)
        self.assertEqual(result["metrics"]["ApplicationUnhealthyCount"], 1)
        self.assertEqual(result["metrics"]["SupportingUnhealthyCount"], 1)
        self.assertEqual(len(result["issues"]), 2)

    def test_repeated_restarts_count_but_recreation_counter_reset_does_not(self):
        states = healthy_states()
        name = "foc-cloud-credit-consumer-1"
        states[name]["restarts"] = 5
        result = snapshot(CONFIG, states, {name: 2}, 10, 20, PUBLIC_ROUTES)
        self.assertEqual(result["metrics"]["ApplicationUnhealthyCount"], 1)
        self.assertEqual(result["issues"][0]["restart_delta"], 3)
        states[name]["restarts"] = 0
        result = snapshot(CONFIG, states, {name: 5}, 10, 20, PUBLIC_ROUTES)
        self.assertEqual(result["metrics"]["ApplicationUnhealthyCount"], 0)

    def test_failed_public_routes_do_not_disappear_behind_healthy_containers(self):
        routes = {**PUBLIC_ROUTES, "/v1/orders": 502, "/healthz": None}
        result = snapshot(CONFIG, healthy_states(), {}, 10, 20, routes)
        self.assertEqual(result["metrics"]["ApplicationUnhealthyCount"], 0)
        self.assertEqual(result["metrics"]["PublicRouteUnhealthyCount"], 2)

    def test_public_401_is_expected_and_network_failure_is_recorded_without_body(self):
        def request(req, timeout):
            self.assertEqual(timeout, 3)
            self.assertEqual(req.get_method(), "GET")
            self.assertIsNone(req.get_header("Authorization"))
            if req.full_url.endswith("/v1/orders"):
                raise urllib.error.HTTPError(req.full_url, 401, "private body", {}, None)
            raise OSError("private diagnostic data")

        with patch("monitor_runtime.urllib.request.urlopen", side_effect=request):
            result = public_routes(CONFIG["public_origin"])
        self.assertEqual(result["/v1/orders"], 401)
        self.assertIsNone(result["/healthz"])
        self.assertNotIn("private", json.dumps(result))

    def test_inspection_requests_only_state_fields_and_expected_names(self):
        name = "foc-cloud-user-service-1"
        item = healthy_states()[name]
        with (
            patch("monitor_runtime.os.geteuid", return_value=0, create=True),
            patch(
                "monitor_runtime.execute",
                side_effect=[name + "\nunrelated-container", json.dumps(item)],
            ) as run,
        ):
            self.assertEqual(set(container_states()), {name})
        self.assertEqual(
            run.call_args_list[1].args[0], ["docker", "inspect", "--format", INSPECT_FORMAT, name]
        )
        self.assertNotIn(".Config", INSPECT_FORMAT)
        self.assertNotIn(".Env", INSPECT_FORMAT)
        self.assertNotIn(".Log", INSPECT_FORMAT)

    def test_dependency_errors_and_timeouts_do_not_expose_arguments_or_stderr(self):
        secret = "sensitive-provider-error"
        for response in (
            subprocess.CompletedProcess([], 1, "", secret),
            subprocess.TimeoutExpired(["aws", secret], 15),
        ):
            with (
                self.subTest(response=type(response).__name__),
                patch("monitor_runtime.subprocess.run") as run,
            ):
                if isinstance(response, Exception):
                    run.side_effect = response
                else:
                    run.return_value = response
                with self.assertRaises(MonitoringError) as raised:
                    execute(["aws", secret])
                self.assertNotIn(secret, str(raised.exception))

    def test_metrics_follow_health_log_and_use_one_fixed_dimension(self):
        result = snapshot(CONFIG, healthy_states(), {}, 10, 20, PUBLIC_ROUTES)
        with patch("monitor_runtime.execute", return_value="") as run:
            publish(CONFIG, result)
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual(
            [command[2] for command in commands],
            ["create-log-stream", "put-log-events", "put-metric-data"],
        )
        metrics = json.loads(commands[-1][commands[-1].index("--metric-data") + 1])
        self.assertEqual(len(metrics), 6)
        self.assertEqual(len({metric["MetricName"] for metric in metrics}), 6)
        for metric in metrics:
            self.assertEqual(
                metric["Dimensions"], [{"Name": "InstanceId", "Value": CONFIG["instance_id"]}]
            )
        self.assertIn(NAMESPACE, commands[-1])
        self.assertIn(LOG_GROUP, commands[0])

    def test_failed_log_delivery_does_not_publish_successful_heartbeat(self):
        result = snapshot(CONFIG, healthy_states(), {}, 10, 20, PUBLIC_ROUTES)
        with patch("monitor_runtime.execute", side_effect=MonitoringError("denied")) as run:
            with self.assertRaises(MonitoringError):
                publish(CONFIG, result)
        self.assertEqual(run.call_count, 1)

    def test_state_and_configuration_writes_are_atomic_and_contain_no_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_file(root / "config.json", json.dumps(CONFIG), 0o600)
            save_state(root / "previous.json", healthy_states())
            self.assertEqual(json.loads((root / "config.json").read_text()), CONFIG)
            self.assertEqual(set(json.loads((root / "previous.json").read_text())), set(EXPECTED))
            self.assertEqual(
                sorted(path.name for path in root.iterdir()), ["config.json", "previous.json"]
            )
            if os.name == "posix":
                self.assertEqual((root / "config.json").stat().st_mode & 0o777, 0o600)
                self.assertEqual((root / "previous.json").stat().st_mode & 0o777, 0o600)

    def test_installer_requires_the_actual_instance_role_identity(self):
        identity = {
            "Account": CONFIG["account_id"],
            "Arn": f"arn:aws:sts::{CONFIG['account_id']}:assumed-role/foc-ec2-role/{CONFIG['instance_id']}",
        }
        self.assertTrue(identity_matches(CONFIG, identity))
        for field, value in (
            ("Account", "000000000000"),
            ("Arn", identity["Arn"].replace(CONFIG["instance_id"], "different-session")),
        ):
            self.assertFalse(identity_matches(CONFIG, {**identity, field: value}))


class MonitoringInfrastructureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.template = json.loads((REPOSITORY / "deploy/aws/monitoring/stack.json").read_text())

    def test_monitoring_stack_does_not_own_application_or_database_infrastructure(self):
        allowed = {
            "AWS::SNS::Topic",
            "AWS::SNS::TopicPolicy",
            "AWS::SNS::Subscription",
            "AWS::Logs::LogGroup",
            "AWS::IAM::Policy",
            "AWS::CloudWatch::Alarm",
            "AWS::CloudWatch::Dashboard",
        }
        self.assertTrue(
            all(resource["Type"] in allowed for resource in self.template["Resources"].values())
        )
        self.assertEqual(self.template["Parameters"]["EnableNotifications"]["Default"], "false")
        self.assertEqual(
            self.template["Resources"]["HealthLogGroup"]["Properties"]["RetentionInDays"], 7
        )

    def test_publish_permissions_cannot_read_logs_secrets_or_business_data(self):
        policy = self.template["Resources"]["PublishPolicy"]["Properties"]["PolicyDocument"]
        metrics, logs = policy["Statement"]
        self.assertEqual(metrics["Action"], "cloudwatch:PutMetricData")
        self.assertEqual(metrics["Condition"]["StringEquals"]["cloudwatch:namespace"], NAMESPACE)
        self.assertEqual(set(logs["Action"]), {"logs:CreateLogStream", "logs:PutLogEvents"})
        self.assertIn("log-stream:${InstanceId}", logs["Resource"]["Fn::Sub"])
        self.assertNotIn("GetSecret", json.dumps(policy))

    def test_alarm_windows_tolerate_short_rollouts_and_do_not_take_ec2_actions(self):
        alarms = [
            resource["Properties"]
            for resource in self.template["Resources"].values()
            if resource["Type"] == "AWS::CloudWatch::Alarm"
        ]
        self.assertEqual(len(alarms), 8)
        for alarm in alarms:
            self.assertGreaterEqual(alarm["DatapointsToAlarm"], 2)
            self.assertEqual(alarm["TreatMissingData"], "notBreaching")
            self.assertEqual(alarm["AlarmActions"], [{"Ref": "Alerts"}])
            self.assertEqual(
                alarm["ActionsEnabled"], {"Fn::If": ["NotificationsEnabled", True, False]}
            )
        self.assertEqual(self.template["Resources"]["CpuAlarm"]["Properties"]["Period"], 300)

    def test_heartbeat_is_gated_by_native_running_instance_data_and_uses_m_of_n(self):
        alarm = self.template["Resources"]["CollectorAlarm"]["Properties"]
        self.assertEqual((alarm["DatapointsToAlarm"], alarm["EvaluationPeriods"]), (3, 5))
        queries = {query["Id"]: query for query in alarm["Metrics"]}
        self.assertEqual(queries["s"]["MetricStat"]["Metric"]["MetricName"], "StatusCheckFailed")
        self.assertEqual(queries["h"]["MetricStat"]["Metric"]["MetricName"], "CollectorHeartbeat")
        self.assertEqual(queries["e"]["Expression"], "IF(FILL(s, -1) >= 0, FILL(h, 0), 1)")

    def test_timer_is_separate_from_application_rollout_and_disables_credential_files(self):
        service = (REPOSITORY / "deploy/aws/systemd/foc-monitoring.service").read_text()
        timer = (REPOSITORY / "deploy/aws/systemd/foc-monitoring.timer").read_text()
        self.assertIn("AWS_CONFIG_FILE=/dev/null", service)
        self.assertIn("AWS_SHARED_CREDENTIALS_FILE=/dev/null", service)
        self.assertIn("NoNewPrivileges=true", service)
        self.assertIn("ProtectSystem=strict", service)
        self.assertNotIn("docker compose", service)
        self.assertIn("OnUnitActiveSec=60s", timer)


@unittest.skipUnless(
    os.environ.get("CLOUD_MONITORING_SMOKE") == "1", "disposable runner Docker metadata"
)
class MonitoringDockerTests(unittest.TestCase):
    def test_real_inspector_reads_only_the_prepared_database_state(self):
        name = os.environ.get("CLOUD_MONITORING_CONTAINER", "supabase_db_user-service")
        self.assertIn(name, EXPECTED)
        state = wait_for_container(name)
        self.assertTrue(state["running"])
        self.assertEqual(state["health"], "healthy" if EXPECTED[name] in HEALTH_CHECKED else None)
        self.assertEqual(set(state), {"name", "running", "health", "restarts"})


if __name__ == "__main__":
    unittest.main()
