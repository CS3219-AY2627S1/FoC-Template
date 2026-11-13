import pytest

from app.config import Settings


def base_environment(monkeypatch) -> None:
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql+psycopg://credit:test@credit-db/foc_credits"
    )
    monkeypatch.setenv("USER_SERVICE_URL", "https://user-service:8080")
    monkeypatch.setenv("USER_SERVICE_CA_FILE", "/run/tls/ca.crt")


def test_retry_schedule_is_configurable(monkeypatch) -> None:
    base_environment(monkeypatch)
    monkeypatch.setenv("CREDIT_RETRY_BACKOFF_SECONDS", "0.25, 1, 5")

    assert Settings.from_env().retry_backoff_seconds == (0.25, 1.0, 5.0)


@pytest.mark.parametrize("value", ["", "0,1", "one,2", "-1,2"])
def test_retry_schedule_rejects_invalid_values(monkeypatch, value: str) -> None:
    base_environment(monkeypatch)
    monkeypatch.setenv("CREDIT_RETRY_BACKOFF_SECONDS", value)

    with pytest.raises(RuntimeError):
        Settings.from_env()


def test_plain_http_user_service_url_is_rejected(monkeypatch) -> None:
    base_environment(monkeypatch)
    monkeypatch.setenv("USER_SERVICE_URL", "http://user-service:8080")

    with pytest.raises(RuntimeError, match="must be an HTTPS URL"):
        Settings.from_env()


def test_user_service_ca_file_is_required(monkeypatch) -> None:
    base_environment(monkeypatch)
    monkeypatch.delenv("USER_SERVICE_CA_FILE")

    with pytest.raises(RuntimeError, match="USER_SERVICE_CA_FILE must be set"):
        Settings.from_env()
