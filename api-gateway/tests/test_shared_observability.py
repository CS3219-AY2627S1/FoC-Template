"""Behaviour of the shared observability layer, driven over HTTP."""

from __future__ import annotations

import asyncio
import logging
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient

from foc_shared.observability import Observability


def _app(**install_kwargs) -> FastAPI:
    app = FastAPI()
    Observability("svc-test", prefix="svctest").install(app, **install_kwargs)
    return app


def test_metrics_scrape_is_bounded_by_the_refresh_timeout(caplog):
    async def slow_refresh() -> None:
        await asyncio.sleep(5)

    client = TestClient(
        _app(check_broker=False, metrics_refresh=slow_refresh, metrics_refresh_timeout=0.05)
    )
    with caplog.at_level(logging.WARNING, logger="app"):
        started = time.perf_counter()
        response = client.get("/metrics")
        elapsed = time.perf_counter() - started

    assert response.status_code == 200
    assert elapsed < 1.0
    assert "svctest_http_requests_total" in response.text
    warnings = [r for r in caplog.records if r.name == "app" and r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "timed out" in warnings[0].getMessage()


def test_metrics_scrape_reports_a_refresh_raised_timeout_as_a_refresh_failure(caplog):
    async def refresh_raising_timeout() -> None:
        raise TimeoutError("connect timeout")

    client = TestClient(
        _app(check_broker=False, metrics_refresh=refresh_raising_timeout, metrics_refresh_timeout=5)
    )
    with caplog.at_level(logging.WARNING, logger="app"):
        response = client.get("/metrics")

    assert response.status_code == 200
    records = [r for r in caplog.records if r.name == "app"]
    assert [(r.levelno, r.getMessage()) for r in records] == [
        (logging.ERROR, "Metrics refresh failed.")
    ]
    assert records[0].exc_info[0] is TimeoutError
