# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
# Scope: Generated Voice Assist startup, configuration, validation and upstream client code.
# Author review: I validated correctness, and added boundary checks.

"""N3NFR4.1: bound provider spend before any audio is sent anywhere.

State is in memory, so limits apply per instance and reset on restart; Voice Assist runs as a
single instance in the documented deployments."""

import math
import time
from collections import deque
from datetime import datetime
from uuid import UUID

from app.voice_assist.errors import ApiError
from app.voice_assist.times import SGT


class RateLimiter:
    def __init__(self, user_limit: int, window_seconds: int, daily_limit: int, clock=time.time):
        self.user_limit = user_limit
        self.window_seconds = window_seconds
        self.daily_limit = daily_limit
        self.clock = clock
        self._recent: dict[UUID, deque[float]] = {}
        self._day = None
        self._daily = 0

    def _roll_day(self, now: float) -> None:
        # The platform allowance resets at midnight in Singapore.
        day = datetime.fromtimestamp(now, SGT).date()
        if day != self._day:
            self._day, self._daily = day, 0

    def daily_available(self) -> bool:
        self._roll_day(self.clock())
        return self._daily < self.daily_limit

    def acquire(self, user_id: UUID) -> None:
        now = self.clock()
        self._roll_day(now)
        if self._daily >= self.daily_limit:
            raise ApiError(
                503,
                "DAILY_LIMIT_REACHED",
                "Voice drafting is paused for today. Fill in the form instead.",
            )
        recent = self._recent.setdefault(user_id, deque())
        while recent and recent[0] <= now - self.window_seconds:
            recent.popleft()
        if len(recent) >= self.user_limit:
            retry = max(1, math.ceil(recent[0] + self.window_seconds - now))
            raise ApiError(
                429,
                "RATE_LIMITED",
                "You have made several voice drafts recently. Try again later or fill in the form.",
                {"Retry-After": str(retry)},
            )
        recent.append(now)
        self._daily += 1
        if len(self._recent) > 10_000:
            self._recent = {
                key: value
                for key, value in self._recent.items()
                if value and value[-1] > now - self.window_seconds
            }
