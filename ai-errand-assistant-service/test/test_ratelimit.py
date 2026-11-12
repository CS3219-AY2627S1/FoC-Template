#  AI Assistance Disclosure
#  Tool: Anthropic Claude (model unrecorded), date: 2026-11-10 to 2026-11-11
#  Scope (AI-64): Generated unit tests for the rate limiting logic of the AI Errand Assistant Service, including request counting, window sliding, and per-user enforcement.
#  Author review: Code changes were checked and validated

import pytest
from fastapi import HTTPException

from main.ratelimit import RateLimiter


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_allows_up_to_the_limit_then_rejects_with_retry_after():
    clock = FakeClock()
    limiter = RateLimiter(max_requests=2, window_seconds=60, clock=clock)
    limiter.check("alice")
    clock.now += 10
    limiter.check("alice")
    with pytest.raises(HTTPException) as error:
        limiter.check("alice")
    assert error.value.status_code == 429
    assert error.value.headers["Retry-After"] == "50"


def test_window_slides():
    clock = FakeClock()
    limiter = RateLimiter(max_requests=1, window_seconds=60, clock=clock)
    limiter.check("alice")
    clock.now += 60
    limiter.check("alice")


def test_limits_are_per_user():
    limiter = RateLimiter(max_requests=1, window_seconds=60, clock=FakeClock())
    limiter.check("alice")
    limiter.check("bob")
    with pytest.raises(HTTPException):
        limiter.check("alice")


def test_zero_disables_the_limit():
    limiter = RateLimiter(max_requests=0, window_seconds=60, clock=FakeClock())
    for _ in range(100):
        limiter.check("alice")


def test_idle_users_are_forgotten():
    clock = FakeClock()
    limiter = RateLimiter(max_requests=1, window_seconds=60, clock=clock)
    limiter.check("alice")
    clock.now += 61
    limiter.check("bob")
    assert set(limiter._hits) == {"bob"}
