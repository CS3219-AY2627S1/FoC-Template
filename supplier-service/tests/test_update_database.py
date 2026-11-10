# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Scope: Generated and refined Supplier regression tests and test fixtures.
# Author review: I validated correctness, and added boundary checks.

"""Optional local PostgreSQL check for update atomicity and database triggers."""

import os
import time
from urllib.parse import urlparse
from uuid import uuid4

import psycopg
import pytest
from psycopg.rows import dict_row

from app.errors import ApiError
from app.repository import SupplierRepository
from app.schemas import SupplierCreate, SupplierPatch


def _local_test_database_url() -> str:
    url = os.getenv("SUPPLIER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set SUPPLIER_TEST_DATABASE_URL to the local Supplier Supabase database")
    parsed = urlparse(url)
    if parsed.hostname not in ("localhost", "127.0.0.1") or parsed.port != 55322:
        pytest.fail(
            "Database update tests may run only against local Supplier Supabase on port 55322"
        )
    return url


def _snapshot(url: str, supplier_id):
    with psycopg.connect(url, row_factory=dict_row) as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM supplier_service.suppliers WHERE id = %s", (supplier_id,))
            row = cursor.fetchone()
            cursor.execute(
                "SELECT category_code FROM supplier_service.supplier_categories "
                "WHERE supplier_id = %s ORDER BY category_code",
                (supplier_id,),
            )
            categories = [item["category_code"] for item in cursor.fetchall()]
            return row, categories


def test_update_preserves_omitted_fields_replaces_categories_and_rolls_back_rejections():
    url = _local_test_database_url()
    repository = SupplierRepository(url)
    suffix = uuid4().hex
    created_ids = []
    try:
        first = repository.create(
            SupplierCreate(
                name=f"Review Cafe {suffix}",
                categories=["FOOD", "COFFEE"],
                building_area="Review Area",
                pickup_location_description="First location",
                floor="2",
                latitude=1.3,
                longitude=103.8,
                opening_time="09:00",
                closing_time="18:00",
                image_url="https://example.com/first.png",
            )
        )
        created_ids.append(first.id)
        second = repository.create(
            SupplierCreate(
                name=f"Other Cafe {suffix}",
                categories=["FOOD"],
                building_area="Review Area",
                pickup_location_description="Second location",
            )
        )
        created_ids.append(second.id)

        partial = repository.update(
            first.id, SupplierPatch(pickup_location_description="New pickup point")
        )
        assert partial.id == first.id and partial.created_at == first.created_at
        assert partial.updated_at > first.updated_at
        assert partial.name == first.name and partial.floor == "2"
        assert partial.categories == ["COFFEE", "FOOD"]
        assert (partial.latitude, partial.longitude) == (first.latitude, first.longitude)
        assert (partial.opening_time, partial.closing_time, partial.image_url) == (
            first.opening_time,
            first.closing_time,
            first.image_url,
        )

        time.sleep(0.01)
        category_only = repository.update(first.id, SupplierPatch(categories=["SHOPPING"]))
        assert category_only.categories == ["SHOPPING"]
        assert category_only.updated_at > partial.updated_at
        assert category_only.created_at == first.created_at

        full = repository.update(
            first.id,
            SupplierPatch(
                name=f"Updated Cafe {suffix}",
                categories=["PRINTING"],
                building_area="Updated Area",
                pickup_location_description="Updated pickup",
                floor="3",
                latitude=1.31,
                longitude=103.81,
                opening_time="10:00",
                closing_time="20:00",
                image_url="https://example.com/updated.png",
                status="INACTIVE",
            ),
        )
        assert full.name == f"Updated Cafe {suffix}"
        assert full.categories == ["PRINTING"]
        assert full.building_area == "Updated Area"
        assert full.pickup_location_description == "Updated pickup"
        assert full.floor == "3"
        assert (full.latitude, full.longitude) == (1.31, 103.81)
        assert (full.opening_time, full.closing_time) == ("10:00", "20:00")
        assert full.image_url == "https://example.com/updated.png"
        assert full.status == "INACTIVE"
        assert full.id == first.id and full.created_at == first.created_at

        cleared = repository.update(
            first.id,
            SupplierPatch(
                floor=None,
                latitude=None,
                longitude=None,
                opening_time=None,
                closing_time=None,
                image_url=None,
            ),
        )
        assert all(
            getattr(cleared, field) is None
            for field in (
                "floor",
                "latitude",
                "longitude",
                "opening_time",
                "closing_time",
                "image_url",
            )
        )
        assert cleared.status == "INACTIVE"

        before = _snapshot(url, first.id)
        with pytest.raises(ApiError) as duplicate:
            repository.update(
                first.id,
                SupplierPatch(
                    name=f"  {second.name.upper()}  ",
                    building_area="  review   area  ",
                    floor=" ",
                    categories=["LANDMARK"],
                ),
            )
        assert duplicate.value.status_code == 409
        assert _snapshot(url, first.id) == before

        for invalid_patch in (
            SupplierPatch(name="Rejected Name", categories=["UNKNOWN"]),
            SupplierPatch(categories=[]),
            SupplierPatch(name="  "),
            SupplierPatch(status=None),
            SupplierPatch(latitude=1.3),
            SupplierPatch(opening_time="09:00"),
        ):
            with pytest.raises(ApiError) as rejected:
                repository.update(first.id, invalid_patch)
            assert rejected.value.status_code == 422
            assert _snapshot(url, first.id) == before

        own_identity = repository.update(
            second.id,
            SupplierPatch(
                name=f"  {second.name.upper()}  ",
                building_area=" review   area ",
                floor=" ",
            ),
        )
        assert own_identity.id == second.id
        assert own_identity.floor is None

        # A row written outside the API may contain seconds. An unrelated
        # PATCH must still validate the full resulting record before writing.
        with psycopg.connect(url) as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE supplier_service.suppliers "
                    "SET opening_time = '09:00:30', closing_time = '18:00:30' WHERE id = %s",
                    (first.id,),
                )
        invalid_existing = _snapshot(url, first.id)
        with pytest.raises(ApiError) as invalid_result:
            repository.update(first.id, SupplierPatch(name="Unrelated Name"))
        assert invalid_result.value.status_code == 422
        assert _snapshot(url, first.id) == invalid_existing

        with pytest.raises(ApiError) as missing:
            repository.update(uuid4(), SupplierPatch(name="Missing"))
        assert missing.value.status_code == 404
    finally:
        if created_ids:
            with psycopg.connect(url) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM supplier_service.suppliers WHERE id = ANY(%s)",
                        (created_ids,),
                    )
            for supplier_id in created_ids:
                assert _snapshot(url, supplier_id) == (None, [])
