import re
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def test_vector_internal_logs_promote_metadata_level():
    config = (REPOSITORY_ROOT / "observability/vector.yaml").read_text()

    assert "is_object(.metadata) && is_string(.metadata.level)" in config
    assert ".level = .metadata.level" in config


def test_supplier_compose_processes_inherit_app_environment():
    config = (REPOSITORY_ROOT / "compose.yaml").read_text()

    for service in ("supplier-service", "supplier-migrate", "supplier-seed"):
        section = re.search(
            rf"(?ms)^  {re.escape(service)}:\n.*?(?=^  [\w-]+:|\Z)",
            config,
        )
        assert section is not None
        assert "APP_ENV: ${APP_ENV:-development}" in section.group()


def test_notification_processes_are_collected_and_inherit_app_environment():
    vector = (REPOSITORY_ROOT / "observability/vector.yaml").read_text()
    compose = (REPOSITORY_ROOT / "compose.yaml").read_text()

    for service in (
        "notification-service",
        "notification-migrate",
        "notification-worker",
    ):
        assert f'== "{service}"' in vector
        section = re.search(
            rf"(?ms)^  {re.escape(service)}:\n.*?(?=^  [\w-]+:|\Z)",
            compose,
        )
        assert section is not None
        assert "APP_ENV: ${APP_ENV:-development}" in section.group()
        assert "APP_VERSION: ${APP_VERSION:-unknown}" in section.group()
