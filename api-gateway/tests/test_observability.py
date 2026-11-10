# AI-influenced: implemented with AI assistance; see ai/usage-log.md.
"""The gateway edge metrics are labelled per downstream service."""

from __future__ import annotations

import random
import string
import urllib.request

import pytest
from fastapi.testclient import TestClient

from app.exposed_routes import ROUTE_TABLE
from app.main import app
from app.observability import OBS, route_label

BOUNDED_LABELS = {f"{prefix}/*" for prefix in ROUTE_TABLE} | {"<other>"}


def test_gateway_route_label_collapses_to_the_downstream_service():
    assert route_label("/api/credits/u-1/balance") == "/api/credits/*"
    assert route_label("/api/orders/abc/approve") == "/api/orders/*"
    assert route_label("/api/chat/ws-ticket") == "/api/chat/*"


@pytest.mark.parametrize(
    "path",
    [
        "/api/unknown/x",
        "/api",
        "/api/",
        "/random/path",
        "/",
        "/wp-admin.php",
        "/api/../etc/passwd",
        "/API/credits/x",
        "/health",
    ],
)
def test_gateway_route_label_collapses_unknown_paths_to_other(path):
    assert route_label(path) == "<other>"


def _random_path(rng: random.Random) -> str:
    alphabet = string.ascii_letters + string.digits + "-_."
    heads = ["api", "API", "", "metrics", *(p.strip("/").split("/")[1] for p in ROUTE_TABLE)]
    segments = [rng.choice(heads)]
    for _ in range(rng.randint(0, 4)):
        segments.append("".join(rng.choices(alphabet, k=rng.randint(1, 12))))
    return "/" + "/".join(segments)


def test_gateway_route_labels_stay_within_the_bounded_set():
    rng = random.Random(37)
    paths = [_random_path(rng) for _ in range(50)]

    labels = {route_label(path) for path in paths}

    assert labels <= BOUNDED_LABELS


def test_requests_through_the_gateway_record_only_bounded_route_labels():
    client = TestClient(app)
    for path in ["/wp-admin.php", "/api/unknown/x", "/random/a/b/c", "/api"]:
        client.get(path)

    recorded = {
        sample.labels["route"]
        for family in OBS.http_requests.collect()
        for sample in family.samples
    }

    assert "<other>" in recorded
    assert recorded <= BOUNDED_LABELS


def test_observability_uses_the_service_prefix():
    assert OBS.service == "api-gateway"
    assert b"gateway_http_requests_total" in OBS.render()


def test_public_app_does_not_serve_metrics():
    client = TestClient(app)

    response = client.get("/metrics")

    assert response.status_code == 404
    assert "gateway_http_requests_total" not in response.text
    assert client.get("/health/ready").status_code == 200


def test_serve_metrics_exposes_the_registry_on_its_own_port():
    server, thread = OBS.serve_metrics(0, addr="127.0.0.1")
    try:
        url = f"http://127.0.0.1:{server.server_port}/metrics"
        with urllib.request.urlopen(url, timeout=5) as response:
            body = response.read().decode()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    assert "gateway_http_requests_total" in body


def test_lifespan_starts_and_stops_the_internal_metrics_server():
    with TestClient(app):
        server = app.state.metrics_server
        thread = app.state.metrics_thread
        url = f"http://127.0.0.1:{server.server_port}/metrics"
        with urllib.request.urlopen(url, timeout=5) as response:
            body = response.read().decode()

    assert "gateway_http_requests_total" in body
    assert server.socket.fileno() == -1
    assert not thread.is_alive()
