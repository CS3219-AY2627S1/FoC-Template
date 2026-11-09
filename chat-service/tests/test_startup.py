"""Start-up waits for RabbitMQ instead of failing on the first refused connection.

AI-assisted (Claude Opus 5.5); reviewed by authors.
"""

from __future__ import annotations

import asyncio

import pytest
from aio_pika.exceptions import AMQPConnectionError

from app import main


async def test_retries_until_rabbitmq_accepts(monkeypatch: pytest.MonkeyPatch) -> None:
    sleeps: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr(main.asyncio, "sleep", fake_sleep)
    calls = 0

    async def start() -> None:
        nonlocal calls
        calls += 1
        if calls < 3:
            raise AMQPConnectionError("[Errno 111] Connection refused")

    await main.start_with_retry("test", start, timeout_s=60)

    assert calls == 3
    assert sleeps == [0.5, 1.0]


async def test_gives_up_after_the_timeout() -> None:
    async def start() -> None:
        raise ConnectionRefusedError(111, "Connection refused")

    with pytest.raises(ConnectionRefusedError):
        await asyncio.wait_for(main.start_with_retry("test", start, timeout_s=0.2), 5)


async def test_other_errors_are_not_retried() -> None:
    calls = 0

    async def start() -> None:
        nonlocal calls
        calls += 1
        raise ValueError("bad exchange")

    with pytest.raises(ValueError):
        await main.start_with_retry("test", start, timeout_s=60)
    assert calls == 1
