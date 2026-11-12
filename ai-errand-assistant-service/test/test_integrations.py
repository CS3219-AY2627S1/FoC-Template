#  AI Assistance Disclosure
#  Tool: Anthropic Claude (model unrecorded), date: 2026-11-10 to 2026-11-11
#  Scope (AI-64): Generated unit tests for integration functions of the AI Errand Assistant Service, including supplier catalog and completed errand history fetching.
#  Author review: Code changes were checked and validated


import asyncio
from uuid import UUID

import httpx
import pytest
from fastapi import HTTPException

from main import integrations


SUPPLIER_URL = "http://suppliers.test"
ORDER_URL = "http://orders.test"
USER_ID = UUID(int=5)
BUILDING = {"id": str(UUID(int=20)), "name": "COM3"}


def supplier(number):
    return {
        "id": str(UUID(int=number)),
        "name": f"Supplier {number}",
        "building": {"name": "UTown"},
        "floor": "1",
        "description": None,
    }


@pytest.fixture(autouse=True)
def service_urls(monkeypatch):
    monkeypatch.setenv("SUPPLIER_SERVICE_URL", SUPPLIER_URL)
    monkeypatch.setenv("ORDER_SERVICE_URL", ORDER_URL)
    integrations.clear_catalog_cache()
    yield
    integrations.clear_catalog_cache()


@pytest.fixture
def mock_http(monkeypatch):
    """Route every httpx.AsyncClient through `handler`; returns the request log."""
    requests = []
    state = {"handler": None}
    original_client = httpx.AsyncClient

    def handle(request):
        requests.append(request)
        return state["handler"](request)

    def client(*args, **kwargs):
        return original_client(*args, **kwargs, transport=httpx.MockTransport(handle))

    monkeypatch.setattr(httpx, "AsyncClient", client)

    def use(handler):
        state["handler"] = handler
        return requests

    return use


def catalog_handler(total_pages=2, per_page=None):
    per_page = per_page or {0: [supplier(1)], 1: [supplier(2)]}

    def handler(request):
        if request.url.path == "/buildings":
            return httpx.Response(200, json={"items": [BUILDING]})
        page = int(request.url.params["page"])
        return httpx.Response(
            200,
            json={"items": per_page.get(page, []), "page": {"totalPages": total_pages}},
        )

    return handler


def fetch_catalog(token="user-token"):
    return asyncio.run(integrations.fetch_supplier_catalog(token))


def fetch_history(token="user-token"):
    return asyncio.run(integrations.fetch_completed_history(token, USER_ID))


def expect_error(call, status_code):
    with pytest.raises(HTTPException) as error:
        call()
    assert error.value.status_code == status_code


# --- supplier catalog --------------------------------------------------------


def test_catalog_collects_every_page_and_forwards_the_token(mock_http):
    requests = mock_http(catalog_handler())
    suppliers, buildings = fetch_catalog()

    assert [s.name for s in suppliers] == ["Supplier 1", "Supplier 2"]
    assert suppliers[0].building == "UTown"
    assert [b.name for b in buildings] == ["COM3"]
    assert {r.headers["Authorization"] for r in requests} == {"Bearer user-token"}
    pages = sorted(r.url.params["page"] for r in requests if r.url.path == "/suppliers")
    assert pages == ["0", "1"]


def test_catalog_too_large_is_rejected(mock_http):
    mock_http(catalog_handler(total_pages=integrations.MAX_SUPPLIER_PAGES + 1))
    expect_error(fetch_catalog, 503)


@pytest.mark.parametrize(
    ("status_code", "expected"),
    [(401, 401), (403, 403), (500, 503), (503, 503), (404, 502)],
)
def test_catalog_error_mapping(mock_http, status_code, expected):
    mock_http(lambda request: httpx.Response(status_code, json={}))
    expect_error(fetch_catalog, expected)


def test_catalog_connection_failure_is_unavailable(mock_http):
    def handler(request):
        raise httpx.ConnectError("refused", request=request)

    mock_http(handler)
    expect_error(fetch_catalog, 503)


@pytest.mark.parametrize(
    "body",
    [
        {"items": [supplier(1)]},  # no pagination metadata
        {"items": [supplier(1)], "page": {"totalPages": -1}},
        {"items": [{"id": "not-a-uuid", "name": "x", "building": {"name": "y"}}],
         "page": {"totalPages": 1}},
    ],
)
def test_catalog_invalid_data_is_bad_gateway(mock_http, body):
    def handler(request):
        if request.url.path == "/buildings":
            return httpx.Response(200, json={"items": [BUILDING]})
        return httpx.Response(200, json=body)

    mock_http(handler)
    expect_error(fetch_catalog, 502)


def test_catalog_is_cached_between_requests(mock_http):
    requests = mock_http(catalog_handler(total_pages=1))
    first = fetch_catalog("token-a")
    count = len(requests)
    second = fetch_catalog("token-b")

    assert len(requests) == count  # served from cache
    assert first == second
    # Callers get their own lists, so mutating one can't corrupt the cache.
    second[0].clear()
    assert len(fetch_catalog()[0]) == 1


def test_catalog_cache_can_be_disabled(mock_http, monkeypatch):
    monkeypatch.setattr(integrations, "CATALOG_CACHE_SECONDS", 0)
    requests = mock_http(catalog_handler(total_pages=1))
    fetch_catalog()
    count = len(requests)
    fetch_catalog()
    assert len(requests) == 2 * count


def test_failed_catalog_fetch_is_not_cached(mock_http):
    mock_http(lambda request: httpx.Response(500))
    expect_error(fetch_catalog, 503)
    mock_http(catalog_handler(total_pages=1))
    assert len(fetch_catalog()[0]) == 1


# --- completed history -------------------------------------------------------


def test_history_requests_only_the_callers_completed_requests(mock_http):
    items = [{"credit_value": 5}]
    requests = mock_http(lambda request: httpx.Response(200, json={"items": items, "total": 12}))
    total, history = fetch_history()

    assert (total, history) == (12, items)
    (request,) = requests
    assert str(request.url).startswith(f"{ORDER_URL}/errands")
    assert request.url.params["status"] == "COMPLETED"
    assert request.url.params["requester_id"] == str(USER_ID)
    assert request.url.params["sort"] == "created_at,desc"
    assert request.headers["Authorization"] == "Bearer user-token"


@pytest.mark.parametrize(
    ("status_code", "expected"),
    [(401, 401), (403, 403), (500, 503), (422, 502)],
)
def test_history_error_mapping(mock_http, status_code, expected):
    mock_http(lambda request: httpx.Response(status_code, json={}))
    expect_error(fetch_history, expected)


@pytest.mark.parametrize(
    "body",
    [{"items": []}, {"items": "nope", "total": 1}, {"items": [], "total": -1}],
)
def test_history_invalid_data_is_bad_gateway(mock_http, body):
    mock_http(lambda request: httpx.Response(200, json=body))
    expect_error(fetch_history, 502)


def test_history_connection_failure_is_unavailable(mock_http):
    def handler(request):
        raise httpx.ConnectError("refused", request=request)

    mock_http(handler)
    expect_error(fetch_history, 503)
