#  AI Assistance Disclosure
#  Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
#  Scope (AI-64): Generated the main FastAPI application file for the AI Errand Assistant Service
#  Author review: Code changes were checked and validated


import asyncio
import os
import time
from collections.abc import Mapping
from typing import Any
from uuid import UUID

import httpx
from fastapi import HTTPException

from main.schemas import BuildingCandidate, SupplierCandidate


REQUEST_TIMEOUT = 8.0
SUPPLIER_PAGE_SIZE = 100
MAX_SUPPLIER_PAGES = 20
HISTORY_PAGE_SIZE = 100
# Suppliers and buildings are the same active catalog for every caller, so a
# short shared cache is safe. Set to 0 to disable.
CATALOG_CACHE_SECONDS = float(os.getenv("CATALOG_CACHE_SECONDS", "60"))

Catalog = tuple[list[SupplierCandidate], list[BuildingCandidate]]
_catalog_cache: tuple[float, Catalog] | None = None


def clear_catalog_cache() -> None:
    global _catalog_cache
    _catalog_cache = None


def _service_url(name: str, default: str) -> str:
    return os.getenv(name, default).rstrip("/")


def _raise_service_error(response: httpx.Response, service: str) -> None:
    if response.status_code in (401, 403):
        raise HTTPException(response.status_code, f"{service} rejected the access token")
    if response.status_code >= 500:
        raise HTTPException(503, f"{service} is unavailable")
    if not response.is_success:
        raise HTTPException(502, f"{service} returned an unexpected response")


async def fetch_supplier_catalog(access_token: str) -> Catalog:
    """Active suppliers and buildings. Only successful fetches are cached."""
    global _catalog_cache
    now = time.monotonic()
    if _catalog_cache is not None and now - _catalog_cache[0] < CATALOG_CACHE_SECONDS:
        suppliers, buildings = _catalog_cache[1]
        return list(suppliers), list(buildings)
    suppliers, buildings = await _fetch_supplier_catalog(access_token)
    if CATALOG_CACHE_SECONDS > 0:
        _catalog_cache = (now, (suppliers, buildings))
    return list(suppliers), list(buildings)


async def _fetch_supplier_catalog(access_token: str) -> Catalog:
    base_url = _service_url("SUPPLIER_SERVICE_URL", "http://localhost:8080")
    headers = {"Authorization": f"Bearer {access_token}"}

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            suppliers_response, buildings_response = await asyncio.gather(
                client.get(
                    f"{base_url}/suppliers",
                    params={"page": 0, "size": SUPPLIER_PAGE_SIZE, "sort": "name,asc"},
                    headers=headers,
                ),
                client.get(f"{base_url}/buildings", headers=headers),
            )
            _raise_service_error(suppliers_response, "Supplier Service")
            _raise_service_error(buildings_response, "Supplier Service")
            supplier_data = suppliers_response.json()
            building_data = buildings_response.json()
            page = supplier_data["page"]
            total_pages = page["totalPages"]
            if not isinstance(total_pages, int) or total_pages < 0:
                raise ValueError("Invalid supplier pagination metadata")
            if total_pages > MAX_SUPPLIER_PAGES:
                raise HTTPException(503, "Supplier catalog exceeds the supported size")

            supplier_items = list(supplier_data["items"])
            for page_number in range(1, total_pages):
                response = await client.get(
                    f"{base_url}/suppliers",
                    params={
                        "page": page_number,
                        "size": SUPPLIER_PAGE_SIZE,
                        "sort": "name,asc",
                    },
                    headers=headers,
                )
                _raise_service_error(response, "Supplier Service")
                supplier_items.extend(response.json()["items"])
    except httpx.RequestError as exc:
        raise HTTPException(503, "Supplier Service is unavailable") from exc
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(502, "Supplier Service returned invalid catalog data") from exc

    try:
        suppliers = [
            SupplierCandidate(
                id=item["id"],
                name=item["name"],
                building=item["building"]["name"],
                floor=item.get("floor"),
                description=item.get("description"),
            )
            for item in supplier_items
        ]
        buildings = [BuildingCandidate.model_validate(item) for item in building_data["items"]]
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(502, "Supplier Service returned invalid catalog data") from exc
    return suppliers, buildings


async def fetch_completed_history(
    access_token: str,
    requester_id: UUID,
) -> tuple[int, list[Mapping[str, Any]]]:
    """Completed errands the caller requested (not ones they delivered as courier)."""
    base_url = _service_url("ORDER_SERVICE_URL", "http://localhost:8002")
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.get(
                f"{base_url}/errands",
                params={
                    "status": "COMPLETED",
                    "requester_id": str(requester_id),
                    "page": 0,
                    "size": HISTORY_PAGE_SIZE,
                    "sort": "created_at,desc",
                },
                headers={"Authorization": f"Bearer {access_token}"},
            )
    except httpx.RequestError as exc:
        raise HTTPException(503, "Order Service is unavailable") from exc

    _raise_service_error(response, "Order Service")
    try:
        data = response.json()
        items = data["items"]
        total = data["total"]
        if not isinstance(total, int) or total < 0 or not isinstance(items, list):
            raise ValueError("Invalid history response")
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(502, "Order Service returned invalid history data") from exc
    return total, items
