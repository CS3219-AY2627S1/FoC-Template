# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented and debugged database readiness and sessions tests.
# Author review: I validated correctness and added boundary checks where needed.

import asyncio
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from asyncpg import InvalidPasswordError
from sqlalchemy.exc import OperationalError

from app.db import Database, DatabaseUnavailableError


class FakeEngine:
    def __init__(self, *, result=True, error=None, wait=False):
        self.result = result
        self.error = error
        self.wait = wait
        self.closed = False
        self.query = None

    @asynccontextmanager
    async def connect(self):
        try:
            if self.wait:
                await asyncio.Event().wait()
            if self.error:
                raise self.error
            yield self
        finally:
            self.closed = True

    async def scalar(self, query):
        self.query = str(query)
        return self.result


async def test_unconfigured_database_is_not_ready():
    database = Database(None)
    assert not await database.ping()
    with pytest.raises(DatabaseUnavailableError):
        async for _ in database.session():
            pytest.fail("An unconfigured database yielded a session")
    await database.dispose()


@pytest.mark.parametrize("result", [True, False, None])
async def test_probe_checks_schema_without_mutation(result):
    database = Database(None)
    engine = FakeEngine(result=result)
    database._engine = engine
    assert await database.ping() is (result is True)
    assert engine.query.startswith("SELECT has_schema_privilege")
    assert engine.closed


@pytest.mark.parametrize("error", [
    OSError("password=secret"),
    TimeoutError("password=secret"),
    InvalidPasswordError("password=secret"),
    OperationalError("secret SQL", {}, Exception("password=secret")),
])
async def test_expected_failures_are_safe_and_recoverable(error, caplog):
    database = Database(None)
    engine = FakeEngine(error=error)
    database._engine = engine
    assert not await database.ping()
    assert "secret" not in caplog.text
    engine.error = None
    assert await database.ping()


async def test_entire_probe_is_bounded(monkeypatch):
    monkeypatch.setattr("app.db.PROBE_TIMEOUT_SECONDS", 0.01)
    database = Database(None)
    engine = FakeEngine(wait=True)
    database._engine = engine
    assert not await asyncio.wait_for(database.ping(), timeout=1)
    assert engine.closed


async def test_dispose_releases_engine():
    database = Database(None)
    database._engine = AsyncMock()
    await database.dispose()
    database._engine.dispose.assert_awaited_once()
