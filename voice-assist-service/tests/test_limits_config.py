# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
# Scope: Generated and refined Voice Assist regression tests and evaluation fixtures.
# Author review: I validated correctness, and added boundary checks.

"""N3NFR4.1 limits and configuration validation."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.voice_assist.errors import ApiError
from app.voice_assist.limits import RateLimiter


class Clock:
    def __init__(self, value):
        self.value = value

    def __call__(self):
        return self.value


def test_user_limit_is_a_sliding_window():
    clock = Clock(1_000.0)
    limiter = RateLimiter(user_limit=2, window_seconds=600, daily_limit=100, clock=clock)
    user = uuid4()
    limiter.acquire(user)
    clock.value += 100
    limiter.acquire(user)
    with pytest.raises(ApiError) as error:
        limiter.acquire(user)
    assert error.value.headers == {"Retry-After": "500"}
    limiter.acquire(uuid4())  # other requesters are unaffected
    clock.value += 501
    limiter.acquire(user)


def test_daily_limit_resets_at_singapore_midnight():
    before_midnight = datetime(2026, 10, 30, 15, 59, tzinfo=UTC).timestamp()  # 23:59 SGT
    clock = Clock(before_midnight)
    limiter = RateLimiter(user_limit=10, window_seconds=600, daily_limit=1, clock=clock)
    limiter.acquire(uuid4())
    assert limiter.daily_available() is False
    with pytest.raises(ApiError) as error:
        limiter.acquire(uuid4())
    assert error.value.code == "DAILY_LIMIT_REACHED"
    clock.value += 120  # 00:01 SGT
    assert limiter.daily_available() is True


def test_provider_configuration():
    assert Settings(_env_file=None, openai_api_key="  ").provider_configured is False
    assert Settings(_env_file=None, openai_api_key="sk-test").provider_configured is True
    assert Settings(_env_file=None, voice_assist_provider="fake").provider_configured is True


@pytest.mark.parametrize(
    "url", ["ftp://user", "http://user/path", "http://a:b@user", "http://user?x=1"]
)
def test_service_urls_must_be_plain_origins(url):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, user_service_base_url=url)


def test_api_key_is_never_shown():
    settings = Settings(_env_file=None, openai_api_key="sk-secret")
    assert "sk-secret" not in repr(settings)
