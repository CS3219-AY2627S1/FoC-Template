# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13
# Scope: Added configuration validation tests.
# Author review: I validated correctness and supplied additional boundary checks.

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_blank_values_become_unset():
    settings = Settings(
        _env_file=None,
        database_url=" ",
        rabbitmq_url="",
        order_service_secret=" ",
        initial_credit_allocation="",
    )
    assert settings.database_url is None
    assert settings.rabbitmq_url is None
    assert settings.order_service_secret is None
    assert settings.initial_credit_allocation is None


def test_allocation_must_be_positive():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, initial_credit_allocation=0)


def test_consumer_retries_at_least_three_times():
    # M6NFR1.4: a temporarily failing event is retried at least three times.
    with pytest.raises(ValidationError):
        Settings(_env_file=None, consumer_max_attempts=2)
    assert Settings(_env_file=None).consumer_max_attempts >= 3


@pytest.mark.parametrize(
    "url", ["ftp://user-service", "http://u:p@user-service", "http://user-service/v1"]
)
def test_service_url_must_be_plain_origin(url):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, user_service_base_url=url)


def test_service_url_trailing_slash_removed():
    settings = Settings(_env_file=None, user_service_base_url="http://user-service:8000/")
    assert settings.user_service_base_url == "http://user-service:8000"
