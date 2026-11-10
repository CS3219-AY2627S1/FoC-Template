# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Scope: Generated and refined Supplier regression tests and test fixtures.
# Author review: I validated correctness, and added boundary checks.

"""Optional local PostgreSQL check that DELETE only deactivates suppliers."""

import os
from urllib.parse import urlparse
from uuid import uuid4

import psycopg
import pytest
from psycopg.rows import dict_row

from app.errors import ApiError
from app.repository import SupplierRepository
from app.schemas import SupplierCreate


def _local_test_database_url() -> str:
    url = os.getenv("SUPPLIER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set SUPPLIER_TEST_DATABASE_URL to the local Supplier Supabase database")
    parsed = urlparse(url)
    if parsed.hostname not in ("localhost", "127.0.0.1") or parsed.port != 55322:
        pytest.fail(
            "Database delete tests may run only against local Supplier Supabase on port 55322"
        )
    return url


def _snapshot(url, supplier_id):
    with psycopg.connect(url, row_factory=dict_row) as conn, conn.cursor() as cursor:
        cursor.execute("SELECT * FROM supplier_service.suppliers WHERE id = %s", (supplier_id,))
        row = cursor.fetchone()
        cursor.execute(
            "SELECT category_code FROM supplier_service.supplier_categories "
            "WHERE supplier_id = %s ORDER BY category_code",
            (supplier_id,),
        )
        return row, [item["category_code"] for item in cursor.fetchall()]


def test_delete_retains_row_and_categories_and_is_repeatable():
    url = _local_test_database_url()
    repository = SupplierRepository(url)
    supplier_id = None
    try:
        created = repository.create(
            SupplierCreate(
                name=f"Delete Review {uuid4().hex}",
                categories=["FOOD", "COFFEE"],
                building_area="Review Area",
                pickup_location_description="Review pickup",
            )
        )
        supplier_id = created.id
        before, categories = _snapshot(url, supplier_id)
        result = repository.deactivate(supplier_id)
        after, after_categories = _snapshot(url, supplier_id)

        assert result.id == supplier_id and result.outcome == "DEACTIVATED"
        assert after is not None and after["status"] == "INACTIVE"
        assert after["id"] == before["id"] and after["created_at"] == before["created_at"]
        assert after["updated_at"] > before["updated_at"]
        assert all(
            after[column] == before[column]
            for column in before
            if column not in ("status", "updated_at")
        )
        assert after_categories == categories == ["COFFEE", "FOOD"]

        repeated = repository.deactivate(supplier_id)
        assert repeated.outcome == "DEACTIVATED"
        assert _snapshot(url, supplier_id) == (after, categories)

        with pytest.raises(ApiError) as missing:
            repository.deactivate(uuid4())
        assert missing.value.status_code == 404
    finally:
        if supplier_id is not None:
            with psycopg.connect(url) as conn, conn.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM supplier_service.suppliers WHERE id = %s", (supplier_id,)
                )
            assert _snapshot(url, supplier_id) == (None, [])
