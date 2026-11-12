

#  AI Assistance Disclosure
#  Tool: Anthropic Claude (model unrecorded), date: 2026-11-10 to 2026-11-11
#  Scope (AI-64): Generated the rate limiting logic for the AI Errand Assistant Service.
#  Author review: Code changes were checked and validated

import os
import time
from collections import deque
from collections.abc import Callable, Hashable
from math import ceil

from fastapi import HTTPException


class RateLimiter:
    """In-memory sliding-window limiter, keyed per caller.

    State lives in this process only: with several replicas each one enforces
    its own limit. A limit of 0 disables the check.
    """

    def __init__(
        self,
        max_requests: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._clock = clock
        self._hits: dict[Hashable, deque[float]] = {}

    def check(self, key: Hashable) -> None:
        if self.max_requests <= 0:
            return
        now = self._clock()
        window_start = now - self.window_seconds
        # Drop expired timestamps for every key so idle callers don't accumulate.
        for other_key in list(self._hits):
            hits = self._hits[other_key]
            while hits and hits[0] <= window_start:
                hits.popleft()
            if not hits:
                del self._hits[other_key]

        hits = self._hits.setdefault(key, deque())
        if len(hits) >= self.max_requests:
            retry_after = max(1, ceil(hits[0] + self.window_seconds - now))
            raise HTTPException(
                429,
                "Too many draft requests; try again shortly",
                headers={"Retry-After": str(retry_after)},
            )
        hits.append(now)


def draft_rate_limiter_from_env() -> RateLimiter:
    return RateLimiter(
        max_requests=int(os.getenv("AI_DRAFT_RATE_LIMIT", "10")),
        window_seconds=float(os.getenv("AI_DRAFT_RATE_WINDOW_SECONDS", "60")),
    )
