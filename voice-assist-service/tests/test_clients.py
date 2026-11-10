# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
# Scope: Generated and refined Voice Assist regression tests and evaluation fixtures.
# Author review: I validated correctness, and added boundary checks.

"""User and Supplier HTTP clients: fail closed for identity, degrade for suppliers."""

from uuid import uuid4

import httpx
import pytest

from app.core.config import Settings
from app.voice_assist.clients import SupplierDirectory, UserDirectory
from app.voice_assist.errors import ApiError, SupplierLookupError

SETTINGS = Settings(
    _env_file=None,
    user_service_base_url="http://user:8000",
    supplier_service_base_url="http://supplier:8001",
)


def http(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def supplier(name, **extra):
    return {"id": str(uuid4()), "name": name, "building_area": "COM3", "floor": "1"} | extra


async def test_identity_forwards_the_token_and_reads_the_principal():
    user_id = uuid4()

    def handler(request):
        assert request.headers["Authorization"] == "Bearer abc"
        return httpx.Response(
            200, json={"userId": str(user_id), "systemRole": "USER", "accountStatus": "ACTIVE"}
        )

    principal = await UserDirectory(SETTINGS, http(handler)).identity("abc")
    assert principal.user_id == user_id


@pytest.mark.parametrize(("status", "code"), [(401, "UNAUTHENTICATED"), (500, "AUTH_UNAVAILABLE")])
async def test_identity_fails_closed(status, code):
    directory = UserDirectory(SETTINGS, http(lambda r: httpx.Response(status, json={})))
    with pytest.raises(ApiError) as error:
        await directory.identity("abc")
    assert error.value.code == code


async def test_active_suppliers_are_paged_and_cached():
    calls = []

    def handler(request):
        page = int(request.url.params["page"])
        calls.append(page)
        items = [supplier(f"S{page}-{i}") for i in range(100 if page == 1 else 5)]
        return httpx.Response(
            200, json={"items": items, "page": page, "page_size": 100, "total": 105}
        )

    clock = iter([0.0, 30.0, 61.0])
    directory = SupplierDirectory(SETTINGS, http(handler), clock=lambda: next(clock))
    assert len(await directory.active("t")) == 105
    assert len(await directory.active("t")) == 105  # cached
    assert calls == [1, 2]
    await directory.active("t")  # expired
    assert calls == [1, 2, 1, 2]


async def test_supplier_errors_are_lookup_errors():
    directory = SupplierDirectory(SETTINGS, http(lambda r: httpx.Response(503, json={})))
    with pytest.raises(SupplierLookupError):
        await directory.active("t")


@pytest.mark.parametrize(
    ("response", "found"),
    [
        (lambda sid: httpx.Response(404, json={}), False),
        (
            lambda sid: httpx.Response(
                200, json=supplier("X", id=sid, status="INACTIVE", pickup_location_description="P")
            ),
            False,
        ),
        (
            lambda sid: httpx.Response(
                200,
                json=supplier(
                    "X", id=str(uuid4()), status="ACTIVE", pickup_location_description="P"
                ),
            ),
            False,
        ),
        (
            lambda sid: httpx.Response(
                200, json=supplier("X", id=sid, status="ACTIVE", pickup_location_description="P")
            ),
            True,
        ),
    ],
)
async def test_detail_only_returns_the_same_active_supplier(response, found):
    supplier_id = uuid4()
    directory = SupplierDirectory(SETTINGS, http(lambda r: response(str(supplier_id))))
    result = await directory.detail(supplier_id, "t")
    assert (result is not None) is found
