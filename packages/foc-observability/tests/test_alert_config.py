from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def test_readiness_alert_requires_three_failures_in_two_minutes():
    config = (
        REPOSITORY_ROOT
        / "observability/grafana/provisioning/alerting/foc-backend-alerts.yaml"
    ).read_text()
    rule_start = config.index("      - uid: foc-backend-readiness-failure")
    rule_end = config.index("      - uid:", rule_start + 1)
    rule = config[rule_start:rule_end]

    assert 'event="readiness_check_failed" [2m]' in rule
    assert "params:\n                      - 2\n                    type: gt" in rule
    assert "At least three readiness_check_failed events" in rule


def test_notification_worker_has_a_heartbeat_alert():
    config = (
        REPOSITORY_ROOT
        / "observability/grafana/provisioning/alerting/foc-backend-alerts.yaml"
    ).read_text()

    assert "uid: foc-notification-worker-heartbeat" in config
    assert 'service="notification-worker"' in config
    assert 'event="worker_heartbeat"' in config
