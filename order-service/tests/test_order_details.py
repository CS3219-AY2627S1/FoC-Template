# AI-influenced: Verify parallel name enrichment and graceful lookup failures.
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import order_details


@pytest.mark.asyncio
async def test_get_order_names_uses_supplier_and_user_clients(monkeypatch):
    supplier = SimpleNamespace(
        get_supplier=AsyncMock(return_value=SimpleNamespace(name="The Deck"))
    )
    users = SimpleNamespace(get_user_name=AsyncMock(side_effect=["Alice", "Bob"]))
    monkeypatch.setattr(order_details, "get_supplier_client", lambda: supplier)
    monkeypatch.setattr(order_details, "get_user_client", lambda: users)

    assert await order_details.get_order_names("sup-1", "requester-1", "courier-1") == (
        "The Deck",
        "Alice",
        "Bob",
    )
    supplier.get_supplier.assert_awaited_once_with("sup-1")
    assert users.get_user_name.await_count == 2


@pytest.mark.asyncio
async def test_get_order_names_keeps_order_available_on_lookup_failure(monkeypatch):
    supplier = SimpleNamespace(get_supplier=AsyncMock(side_effect=RuntimeError("offline")))
    users = SimpleNamespace(get_user_name=AsyncMock(return_value="Alice"))
    monkeypatch.setattr(order_details, "get_supplier_client", lambda: supplier)
    monkeypatch.setattr(order_details, "get_user_client", lambda: users)

    assert await order_details.get_order_names("sup-1", "requester-1", None) == (
        None,
        "Alice",
        None,
    )
    users.get_user_name.assert_awaited_once_with("requester-1")
