# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
# Scope: Generated and refined Supplier regression tests and test fixtures.
# Author review: I validated correctness, and added boundary checks.

"""Shared connection pool behaviour for Supplier repository requests."""

import os
import time
from urllib.parse import urlparse

import pytest

from app import database
from app.errors import ApiError
from app.repository import SupplierRepository


def test_unreachable_database_fails_fast_with_503(monkeypatch):
    monkeypatch.setattr(database, "POOL_TIMEOUT_SECONDS", 0.5)
    repository = SupplierRepository("postgresql://postgres:postgres@127.0.0.1:1/postgres")
    try:
        started = time.monotonic()
        with pytest.raises(ApiError) as unavailable:
            repository.list_categories()
        assert unavailable.value.status_code == 503
        assert unavailable.value.code == "DATABASE_UNAVAILABLE"
        assert time.monotonic() - started < 5
    finally:
        database.close_pools()


def test_requests_reuse_pooled_connections():
    url = os.getenv("SUPPLIER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set SUPPLIER_TEST_DATABASE_URL to the local Supplier Supabase database")
    parsed = urlparse(url)
    if parsed.hostname not in ("localhost", "127.0.0.1") or parsed.port != 55322:
        pytest.fail("Database pool tests may run only against local Supplier Supabase on 55322")
    repository = SupplierRepository(url)
    repository.list_categories()
    opened = database.get_pool(url).get_stats()["connections_num"]
    for _ in range(5):
        repository.list_categories()
    assert database.get_pool(url).get_stats()["connections_num"] == opened
