# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — tests for 401 and 503 authentication outcomes, 422 validation, and the OpenAPI DTO and params schemas, without a database (ai-20261108-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16, 790 passed and 5 real-broker tests skipped; code read and verified; manual checks against the full Compose stack with the real User Service (ai-20261108-001).
# Details: notification-service/ai/usage-log.md; ai-20261108-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — include GET /notifications/stream in the authentication tests and allow its Last-Event-ID header in the OpenAPI parameter check (ai-20261108-002).
# Author review: Keith confirmed on 2026-11-09: full pytest suite (.venv/bin/python -m pytest -rs), 918 passed and 5 skipped; manual SSE checks against the local Compose stack (ai-20261108-002).
# Details: notification-service/ai/usage-log.md; ai-20261108-002

"""Notification API tests that need no database: authentication, request
validation, and the OpenAPI document.

User Service is replaced by a test double, or by the real client with an
httpx transport that fails. These requests fail before any query runs, so a
SQLite engine with no tables is enough.
"""

from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.clients import UserServiceClient
from app.main import create_app
from tests.api_support import ALICE_TOKEN, FakeUserClient, api_settings, auth

ENDPOINTS = [
    ("GET", "/notifications"),
    ("GET", "/notifications/unread-count"),
    ("POST", "/notifications/1/read"),
    ("POST", "/notifications/read-all"),
    ("GET", "/notifications/stream"),
]

PARAMS_SCHEMAS = {
    "order.opened": ("OrderOpenedParams", {"credit_amount": {"type": "integer"}}),
    "order.rejected": ("OrderRejectedParams", None),
    "order.accepted": ("OrderAcceptedParams", {}),
    "order.picked_up": ("OrderPickedUpParams", {}),
    "order.completed": ("OrderCompletedParams", {"credit_amount": {"type": "integer"}}),
    "order.expired": ("OrderExpiredParams", {}),
    "order.cancelled": ("OrderCancelledParams", None),
}


@pytest.fixture
def fake_users() -> FakeUserClient:
    return FakeUserClient()


@pytest.fixture
def client(tmp_path: Path, fake_users: FakeUserClient):
    settings = api_settings(f"sqlite+pysqlite:///{tmp_path / 'notify.db'}")
    with TestClient(create_app(settings, user_client=fake_users)) as test_client:
        yield test_client


def _client_with_transport(tmp_path: Path, transport: httpx.BaseTransport) -> TestClient:
    settings = api_settings(f"sqlite+pysqlite:///{tmp_path / 'notify.db'}")
    user_client = UserServiceClient(
        settings.user_service_url, settings.user_service_ca_file, transport=transport
    )
    return TestClient(create_app(settings, user_client=user_client))


def _assert_unauthorized(response: httpx.Response) -> None:
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(("method", "path"), ENDPOINTS)
def test_missing_header_returns_401(client, fake_users, method, path) -> None:
    _assert_unauthorized(client.request(method, path))
    assert fake_users.tokens_seen == []


@pytest.mark.parametrize(("method", "path"), ENDPOINTS)
@pytest.mark.parametrize(
    "header",
    ["", "Bearer", "Bearer ", "Bearer    ", f"Basic {ALICE_TOKEN}", ALICE_TOKEN,
     f"Token {ALICE_TOKEN}", f"Bearer{ALICE_TOKEN}"],
)
def test_malformed_header_returns_401(client, fake_users, method, path, header) -> None:
    response = client.request(method, path, headers={"Authorization": header})

    _assert_unauthorized(response)
    assert fake_users.tokens_seen == []


@pytest.mark.parametrize(("method", "path"), ENDPOINTS)
def test_token_rejected_by_user_service_returns_401(
    client, fake_users, method, path
) -> None:
    _assert_unauthorized(client.request(method, path, headers=auth("forged")))
    assert fake_users.tokens_seen == ["forged"]


@pytest.mark.parametrize(("method", "path"), ENDPOINTS)
def test_user_service_outage_returns_503(client, fake_users, method, path) -> None:
    fake_users.unavailable = True

    response = client.request(method, path, headers=auth(ALICE_TOKEN))

    assert response.status_code == 503


@pytest.mark.parametrize(("method", "path"), ENDPOINTS)
def test_user_service_rejection_over_http_returns_401(tmp_path, method, path) -> None:
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((str(request.url), request.headers["authorization"]))
        return httpx.Response(401, json={"detail": "invalid"})

    with _client_with_transport(tmp_path, httpx.MockTransport(handler)) as client:
        response = client.request(method, path, headers=auth("forged"))

    _assert_unauthorized(response)
    assert seen == [("https://user-service.test/users/me", "Bearer forged")]


@pytest.mark.parametrize(("method", "path"), ENDPOINTS)
@pytest.mark.parametrize(
    "error", [httpx.ConnectTimeout("timed out"), httpx.ReadTimeout("timed out")]
)
def test_user_service_timeout_returns_503(tmp_path, method, path, error) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise error

    with _client_with_transport(tmp_path, httpx.MockTransport(handler)) as client:
        response = client.request(method, path, headers=auth(ALICE_TOKEN))

    assert response.status_code == 503


@pytest.mark.parametrize("status_code", [500, 502, 503])
def test_user_service_error_status_returns_503(tmp_path, status_code) -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(status_code))

    with _client_with_transport(tmp_path, transport) as client:
        response = client.get("/notifications", headers=auth(ALICE_TOKEN))

    assert response.status_code == 503


def test_unreachable_user_service_returns_503(tmp_path: Path) -> None:
    # Port 1 on loopback refuses connections; no transport double here.
    settings = api_settings(f"sqlite+pysqlite:///{tmp_path / 'notify.db'}")
    settings = type(settings)(
        database_url=settings.database_url,
        user_service_url="https://127.0.0.1:1",
        user_service_ca_file=settings.user_service_ca_file,
    )
    with TestClient(create_app(settings)) as client:
        response = client.get("/notifications", headers=auth(ALICE_TOKEN))

    assert response.status_code == 503


@pytest.mark.parametrize(
    "query",
    [
        "limit=0",
        "limit=101",
        "limit=-1",
        "limit=abc",
        "limit=1.5",
        "limit=",
        "cursor=abc",
        "cursor=1.5",
        "cursor=",
    ],
)
def test_invalid_cursor_or_limit_returns_422(client, query) -> None:
    response = client.get(f"/notifications?{query}", headers=auth(ALICE_TOKEN))

    assert response.status_code == 422


@pytest.mark.parametrize("notification_id", ["abc", "1.5", "1e3"])
def test_non_integer_path_id_returns_422(client, notification_id) -> None:
    response = client.post(
        f"/notifications/{notification_id}/read", headers=auth(ALICE_TOKEN)
    )

    assert response.status_code == 422


def test_docs_page_is_served(client) -> None:
    response = client.get("/docs")

    assert response.status_code == 200
    assert "swagger" in response.text.lower()


def test_openapi_documents_the_dto(client) -> None:
    schemas = client.get("/openapi.json").json()["components"]["schemas"]

    expected_fields = {
        "id", "type", "recipient_role", "params", "title", "body", "order_id",
        "occurred_at", "created_at", "read_at",
    }
    for event_type, (params_name, _) in PARAMS_SCHEMAS.items():
        dto_name = params_name.replace("Params", "Notification")
        dto = schemas[dto_name]
        assert set(dto["properties"]) == expected_fields
        assert set(dto["required"]) == expected_fields
        assert dto["properties"]["type"]["const"] == event_type
        assert dto["properties"]["params"] == {"$ref": f"#/components/schemas/{params_name}"}
        assert "link" not in dto["properties"]
        assert dto["properties"]["read_at"]["anyOf"] == [
            {"type": "string", "format": "date-time"},
            {"type": "null"},
        ]


def test_openapi_documents_every_params_schema(client) -> None:
    schemas = client.get("/openapi.json").json()["components"]["schemas"]

    for params_name, properties in PARAMS_SCHEMAS.values():
        if properties is not None:
            assert schemas[params_name]["properties"] == {
                name: {**spec, "title": schemas[params_name]["properties"][name]["title"]}
                for name, spec in properties.items()
            }
            assert set(schemas[params_name].get("required", [])) == set(properties)

    rejected = schemas["OrderRejectedParams"]
    assert rejected["required"] == ["reason"]
    assert rejected["properties"]["reason"]["anyOf"] == [
        {"type": "string"},
        {"type": "null"},
    ]
    cancelled = schemas["OrderCancelledParams"]
    assert set(cancelled["required"]) == {"cancelled_by_role", "previous_status"}
    assert cancelled["properties"]["cancelled_by_role"]["enum"] == ["requester", "admin"]
    assert cancelled["properties"]["previous_status"]["type"] == "string"


def test_openapi_lists_the_dto_variants_by_type(client) -> None:
    spec = client.get("/openapi.json").json()
    item_schema = spec["components"]["schemas"]["NotificationPage"]["properties"][
        "items"
    ]["items"]
    mapping = item_schema["discriminator"]["mapping"]

    assert item_schema["discriminator"]["propertyName"] == "type"
    assert set(mapping) == set(PARAMS_SCHEMAS)

    read_response = spec["paths"]["/notifications/{id}/read"]["post"]["responses"]
    assert read_response["200"]["content"]["application/json"]["schema"][
        "discriminator"
    ]["propertyName"] == "type"
    assert {"401", "404", "422", "503"} <= set(read_response)


def test_openapi_does_not_accept_a_user_id_parameter(client) -> None:
    paths = client.get("/openapi.json").json()["paths"]

    for path, operations in paths.items():
        if not path.startswith("/notifications"):
            continue
        for operation in operations.values():
            names = {parameter["name"] for parameter in operation.get("parameters", [])}
            assert names <= {"cursor", "limit", "id", "authorization", "Last-Event-ID"}
            assert "requestBody" not in operation


def test_openapi_documents_the_stream(client) -> None:
    operation = client.get("/openapi.json").json()["paths"]["/notifications/stream"]["get"]

    assert set(operation["responses"]["200"]["content"]) == {"text/event-stream"}
    assert {"401", "503"} <= set(operation["responses"])
    [last_event_id] = [p for p in operation["parameters"] if p["name"] == "Last-Event-ID"]
    assert last_event_id["in"] == "header"
    assert last_event_id["required"] is False


def test_stream_without_a_database_listener_still_rejects_bad_tokens(client) -> None:
    # The SQLite test app starts no LISTEN connection; auth runs first anyway.
    assert client.app.state.listener is None
    response = client.get("/notifications/stream", headers=auth("forged"))

    assert response.status_code == 401
    assert client.app.state.hub.stream_count() == 0


def test_shutdown_closes_the_user_client(tmp_path: Path) -> None:
    fake = FakeUserClient()
    settings = api_settings(f"sqlite+pysqlite:///{tmp_path / 'notify.db'}")
    with TestClient(create_app(settings, user_client=fake)):
        assert not fake.closed

    assert fake.closed
