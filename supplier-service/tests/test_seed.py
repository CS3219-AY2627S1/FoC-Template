# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: GPT-6), date: 2026-11-10
# Scope: Added seed consistency and PostgreSQL seed replay regression checks.

"""Keep the CSV and SQL in sync and preserve managed suppliers on seed replay."""

import os
from urllib.parse import urlparse
from uuid import uuid4

import psycopg
import pytest

from scripts.generate_seed import SEED_PATH, load_suppliers, render_seed


def test_committed_seed_matches_csv():
    assert SEED_PATH.read_text(encoding="utf-8") == render_seed(load_suppliers())


def test_seed_replay_preserves_existing_supplier_and_categories():
    url = os.getenv("SUPPLIER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set SUPPLIER_TEST_DATABASE_URL to the local Supplier Supabase database")
    parsed = urlparse(url)
    if parsed.hostname not in ("localhost", "127.0.0.1") or parsed.port != 55322:
        pytest.fail(
            "Seed database tests may run only against local Supplier Supabase on port 55322"
        )

    supplier = {
        "name": f"Seed replay {uuid4().hex}",
        "building_area": "Seed regression area",
        "pickup_description": "Original pickup point",
        "floor": None,
        "latitude": None,
        "longitude": None,
        "opening_time": None,
        "closing_time": None,
        "categories": ["FOOD", "COFFEE"],
    }
    # A new row after a conflict also checks the INSERT RETURNING target cannot
    # accidentally retain a previous supplier ID when an insertion is skipped.
    second = {**supplier, "name": f"Second seed {uuid4().hex}", "categories": ["PRINTING"]}
    names = [supplier["name"], second["name"]]
    with psycopg.connect(url, autocommit=True) as conn:
        try:
            conn.execute(render_seed([supplier]))
            existing_id = conn.execute(
                "SELECT id FROM supplier_service.suppliers WHERE name = %s", (supplier["name"],)
            ).fetchone()[0]
            with conn.transaction():
                conn.execute(
                    "UPDATE supplier_service.suppliers "
                    "SET pickup_location_description = 'Admin pickup point', status = 'INACTIVE' "
                    "WHERE id = %s",
                    (existing_id,),
                )
                conn.execute(
                    "DELETE FROM supplier_service.supplier_categories WHERE supplier_id = %s",
                    (existing_id,),
                )
                conn.execute(
                    "INSERT INTO supplier_service.supplier_categories VALUES (%s, 'OTHERS')",
                    (existing_id,),
                )
            before = conn.execute(
                "SELECT * FROM supplier_service.suppliers WHERE id = %s", (existing_id,)
            ).fetchone()

            conn.execute(render_seed([second, supplier]))
            conn.execute(render_seed([supplier, second]))

            assert conn.execute(
                "SELECT * FROM supplier_service.suppliers WHERE id = %s", (existing_id,)
            ).fetchone() == before
            assert conn.execute(
                "SELECT category_code FROM supplier_service.supplier_categories "
                "WHERE supplier_id = %s",
                (existing_id,),
            ).fetchall() == [("OTHERS",)]
            assert conn.execute(
                "SELECT count(*) FROM supplier_service.suppliers WHERE name = ANY(%s)", (names,)
            ).fetchone() == (2,)
            assert conn.execute(
                "SELECT category_code FROM supplier_service.supplier_categories c "
                "JOIN supplier_service.suppliers s ON s.id = c.supplier_id WHERE s.name = %s",
                (second["name"],),
            ).fetchall() == [("PRINTING",)]
        finally:
            conn.execute("ROLLBACK")
            conn.execute("DELETE FROM supplier_service.suppliers WHERE name = ANY(%s)", (names,))
