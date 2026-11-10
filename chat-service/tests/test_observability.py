from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app
from app.observability import OBS


def test_observability_uses_the_service_prefix():
    assert OBS.service == "chat-service"
    assert b"chat_http_requests_total" in OBS.render()


def test_metrics_endpoint_is_served_on_repeated_app_creation():
    create_app()
    client = TestClient(create_app())
    res = client.get("/metrics")
    assert res.status_code == 200
    assert b"chat_http_requests_total" in res.content
