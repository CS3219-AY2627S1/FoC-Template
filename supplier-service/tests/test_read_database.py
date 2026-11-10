# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
# Scope: Generated and refined Supplier regression tests and test fixtures.
# Author review: I validated correctness, and added boundary checks.

"""Optional local PostgreSQL checks for supplier read contracts."""

import os
from urllib.parse import urlparse
from uuid import uuid4

import psycopg
import pytest

from app.errors import ApiError
from app.repository import SupplierRepository
from app.schemas import SupplierCreate, SupplierListFilters


@pytest.fixture
def sample_suppliers():
    url = os.getenv("SUPPLIER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set SUPPLIER_TEST_DATABASE_URL to the local Supplier Supabase database")
    parsed = urlparse(url)
    if parsed.hostname not in ("localhost", "127.0.0.1") or parsed.port != 55322:
        pytest.fail(
            "Database read tests may run only against local Supplier Supabase on port 55322"
        )
    repository = SupplierRepository(url)
    marker = f"Read{uuid4().hex}"
    ids = []
    try:
        first = repository.create(
            SupplierCreate(
                name=f"Alpha {marker}",
                categories=["FOOD", "COFFEE"],
                building_area=f" Central  {marker} ",
                pickup_location_description="First pickup",
                floor="1",
                opening_time="09:00",
                closing_time="18:00",
            )
        )
        ids.append(first.id)
        second = repository.create(
            SupplierCreate(
                name=f"Beta {marker}",
                categories=["PRINTING"],
                building_area=f"central {marker}",
                pickup_location_description="Second pickup",
            )
        )
        ids.append(second.id)
        third = repository.create(
            SupplierCreate(
                name=f"Gamma {marker}",
                categories=["SHOPPING"],
                building_area=f"NorthHub{marker}",
                pickup_location_description=f"PickupSpot{marker}",
            )
        )
        ids.append(third.id)
        inactive = repository.create(
            SupplierCreate(
                name=f"Delta {marker}",
                categories=["FOOD"],
                building_area="South Wing",
                pickup_location_description="Inactive pickup",
            )
        )
        ids.append(inactive.id)
        repository.deactivate(inactive.id)
        yield repository, marker, first, second, third, inactive
    finally:
        if ids:
            with psycopg.connect(url) as conn, conn.cursor() as cursor:
                cursor.execute("DELETE FROM supplier_service.suppliers WHERE id = ANY(%s)", (ids,))


def _filters(marker, **changes):
    values = {"q": marker, "categories": [], "sort": "asc", "page": 1, "page_size": 20}
    values.update(changes)
    return SupplierListFilters(**values)


def test_normal_list_search_filter_sort_and_page(sample_suppliers):
    repository, marker, first, second, third, inactive = sample_suppliers
    listed = repository.list_active_suppliers(_filters(marker))
    assert listed.total == 3
    assert [item.id for item in listed.items] == [first.id, second.id, third.id]
    assert inactive.id not in [item.id for item in listed.items]
    assert listed.items[0].categories == ["COFFEE", "FOOD"]
    assert (listed.items[0].opening_time, listed.items[0].closing_time) == ("09:00", "18:00")

    assert [
        item.id
        for item in repository.list_active_suppliers(_filters(f"northhub{marker.upper()}")).items
    ] == [third.id]
    assert [
        item.id
        for item in repository.list_active_suppliers(_filters(f"pickupspot{marker.upper()}")).items
    ] == [third.id]

    by_categories = repository.list_active_suppliers(
        _filters(marker, categories=["FOOD", "COFFEE", "PRINTING"])
    )
    assert by_categories.total == 2
    assert [item.id for item in by_categories.items] == [first.id, second.id]
    combined = repository.list_active_suppliers(_filters(marker, categories=["FOOD"]))
    assert [item.id for item in combined.items] == [first.id]

    assert [
        item.id for item in repository.list_active_suppliers(_filters(marker, sort="desc")).items
    ] == [third.id, second.id, first.id]
    second_page = repository.list_active_suppliers(_filters(marker, page=2, page_size=1))
    assert second_page.total == 3 and [item.id for item in second_page.items] == [second.id]
    assert repository.list_active_suppliers(_filters(marker + "missing")).model_dump() == {
        "items": [],
        "page": 1,
        "page_size": 20,
        "total": 0,
    }
    assert repository.list_active_suppliers(_filters("%" + marker)).total == 0
    assert repository.list_active_suppliers(_filters("_" + marker)).total == 0
    with pytest.raises(ApiError) as invalid_category:
        repository.list_active_suppliers(_filters(marker, categories=["UNKNOWN"]))
    assert invalid_category.value.status_code == 422


def test_search_is_literal_and_ties_follow_sort_direction(sample_suppliers):
    repository, marker, *_ = sample_suppliers
    created = []
    try:
        for area in ("East", "West"):
            created.append(
                repository.create(
                    SupplierCreate(
                        name=f"Twin\\{marker}",
                        categories=["FOOD"],
                        building_area=area,
                        pickup_location_description="Twin pickup",
                    )
                ).id
            )
        twin_ids = sorted(created)

        ascending = repository.list_active_suppliers(_filters(f"twin\\{marker}"))
        assert [item.id for item in ascending.items] == twin_ids
        descending = repository.list_active_suppliers(_filters(f"Twin\\{marker}", sort="desc"))
        assert [item.id for item in descending.items] == twin_ids[::-1]
        assert repository.list_active_suppliers(_filters(f"Twin{marker}")).total == 0
    finally:
        with psycopg.connect(repository.database_url) as conn, conn.cursor() as cursor:
            cursor.execute(
                "DELETE FROM supplier_service.suppliers WHERE id = ANY(%s)", (created,)
            )


def test_active_detail_hides_inactive_and_missing_suppliers(sample_suppliers):
    repository, _marker, first, _second, _third, inactive = sample_suppliers
    detail = repository.get_active_supplier(first.id)
    assert detail.id == first.id
    assert detail.name == first.name
    assert detail.categories == ["COFFEE", "FOOD"]
    assert detail.building_area == first.building_area
    assert detail.pickup_location_description == first.pickup_location_description
    assert (detail.opening_time, detail.closing_time) == ("09:00", "18:00")
    assert detail.created_at == first.created_at and detail.updated_at == first.updated_at

    for supplier_id in (inactive.id, uuid4()):
        with pytest.raises(ApiError) as missing:
            repository.get_active_supplier(supplier_id)
        assert missing.value.status_code == 404


def test_admin_list_includes_both_statuses_and_filters_them(sample_suppliers):
    repository, marker, first, second, third, inactive = sample_suppliers
    both = repository.list_admin_suppliers(_filters(marker), None)
    assert both.total == 4
    assert {item.id for item in both.items} == {first.id, second.id, third.id, inactive.id}
    assert {item.status for item in both.items} == {"ACTIVE", "INACTIVE"}

    active = repository.list_admin_suppliers(_filters(marker), "ACTIVE")
    assert active.total == 3 and all(item.status == "ACTIVE" for item in active.items)
    inactive_only = repository.list_admin_suppliers(_filters(marker), "INACTIVE")
    assert inactive_only.total == 1 and [item.id for item in inactive_only.items] == [inactive.id]
    combined = repository.list_admin_suppliers(_filters(marker, categories=["FOOD"]), "INACTIVE")
    assert [item.id for item in combined.items] == [inactive.id]


def test_admin_detail_includes_inactive_suppliers(sample_suppliers):
    repository, _marker, first, _second, _third, inactive = sample_suppliers
    assert repository.get_admin_supplier(first.id).id == first.id
    detail = repository.get_admin_supplier(inactive.id)
    assert detail.id == inactive.id
    assert detail.status == "INACTIVE"
    assert detail.name == inactive.name
    assert detail.categories == ["FOOD"]
    assert detail.pickup_location_description == inactive.pickup_location_description
    assert detail.created_at == inactive.created_at

    with pytest.raises(ApiError) as missing:
        repository.get_admin_supplier(uuid4())
    assert missing.value.status_code == 404
