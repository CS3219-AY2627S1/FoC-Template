// AI Assistance Disclosure:
// Tool: GitHub Copilot (Copilot SDK in VS Code), date: 2026-11-10
// Scope: Added isolated unit tests for supplier CRUD and favourite service functions.
// Author review: Tests reviewed and verified by author

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import pool from "../src/config/db.ts";
import type { CreateSupplierDTO, Supplier } from "../src/models/types.ts";
import {
  addFavouriteService,
  addSupplierService,
  deactivateSupplierService,
  deleteFavouriteService,
  getAllSuppliersService,
  getSupplierByIdService,
  searchSuppliersService,
  updateSupplierService,
} from "../src/service/supplierService.ts";

const supplier: Supplier = {
  id: "supplier-1",
  name: "Central Cafe",
  type: "Cafe",
  building: "Central",
  floor: "1",
  location_description: null,
  latitude: 1.3,
  longitude: 103.8,
  starting_time: "08:00",
  closing_time: "18:00",
  image_url: null,
  is_active: true,
  is_favourite: false,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

const createSupplier: CreateSupplierDTO = {
  name: supplier.name,
  type: supplier.type,
  building: supplier.building,
  floor: supplier.floor,
  location_description: supplier.location_description,
  latitude: supplier.latitude,
  longitude: supplier.longitude,
  starting_time: supplier.starting_time,
  closing_time: supplier.closing_time,
  image_url: supplier.image_url,
  is_active: supplier.is_active,
};

describe("supplier service", () => {
  it("gets all suppliers with the user's favourite status", async (t) => {
    const query = t.mock.method(pool, "query", async () => ({
      rows: [supplier],
      rowCount: 1,
    }));

    assert.deepEqual(await getAllSuppliersService("user-1"), [supplier]);
    assert.match(query.mock.calls[0].arguments[0] as string, /is_favourite/);
    assert.deepEqual(query.mock.calls[0].arguments[1], ["user-1"]);
  });

  it("passes a null user id and returns an empty list when no suppliers exist", async (t) => {
    const query = t.mock.method(pool, "query", async () => ({
      rows: [],
      rowCount: 0,
    }));

    assert.deepEqual(await getAllSuppliersService(""), []);
    assert.deepEqual(query.mock.calls[0].arguments[1], [null]);
  });

  it("propagates database failures when listing suppliers", async (t) => {
    const error = new Error("database unavailable");
    t.mock.method(pool, "query", async () => {
      throw error;
    });

    await assert.rejects(getAllSuppliersService("user-1"), error);
  });

  it("gets a supplier by id with the user's favourite status", async (t) => {
    const query = t.mock.method(pool, "query", async () => ({
      rows: [supplier],
      rowCount: 1,
    }));

    assert.equal(await getSupplierByIdService("supplier-1", "user-1"), supplier);
    assert.match(query.mock.calls[0].arguments[0] as string, /WHERE s\.id = \$2/);
    assert.deepEqual(query.mock.calls[0].arguments[1], ["user-1", "supplier-1"]);
  });

  it("returns undefined when the requested supplier does not exist", async (t) => {
    t.mock.method(pool, "query", async () => ({ rows: [], rowCount: 0 }));

    assert.equal(await getSupplierByIdService("missing", "user-1"), undefined);
  });

  it("propagates database failures when getting a supplier by id", async (t) => {
    const error = new Error("database unavailable");
    t.mock.method(pool, "query", async () => {
      throw error;
    });

    await assert.rejects(getSupplierByIdService("supplier-1", "user-1"), error);
  });

  it("searches supplier names, types, and buildings case-insensitively", async (t) => {
    const query = t.mock.method(pool, "query", async () => ({
      rows: [supplier],
      rowCount: 1,
    }));

    assert.deepEqual(await searchSuppliersService("cafe", "user-1"), [supplier]);
    assert.match(query.mock.calls[0].arguments[0] as string, /ILIKE \$2/);
    assert.match(query.mock.calls[0].arguments[0] as string, /ORDER BY s\.name ASC/);
    assert.deepEqual(query.mock.calls[0].arguments[1], ["user-1", "%cafe%"]);
  });

  it("allows an empty search term and returns no matches", async (t) => {
    const query = t.mock.method(pool, "query", async () => ({
      rows: [],
      rowCount: 0,
    }));

    assert.deepEqual(await searchSuppliersService("", "user-1"), []);
    assert.deepEqual(query.mock.calls[0].arguments[1], ["user-1", "%%"]);
  });

  it("propagates database failures when searching suppliers", async (t) => {
    const error = new Error("database unavailable");
    t.mock.method(pool, "query", async () => {
      throw error;
    });

    await assert.rejects(searchSuppliersService("cafe", "user-1"), error);
  });

  it("inserts supplier data in the expected order and returns the inserted row", async (t) => {
    const query = t.mock.method(pool, "query", async () => ({
      rows: [supplier],
      rowCount: 1,
    }));

    assert.equal(await addSupplierService(createSupplier), supplier);
    assert.match(query.mock.calls[0].arguments[0] as string, /COALESCE\(\$11, true\)/);
    assert.deepEqual(query.mock.calls[0].arguments[1], [
      createSupplier.name,
      createSupplier.type,
      createSupplier.building,
      createSupplier.floor,
      createSupplier.location_description,
      createSupplier.latitude,
      createSupplier.longitude,
      createSupplier.starting_time,
      createSupplier.closing_time,
      createSupplier.image_url,
      createSupplier.is_active,
    ]);
  });

  it("propagates database failures when adding a supplier", async (t) => {
    const error = new Error("constraint violation");
    t.mock.method(pool, "query", async () => {
      throw error;
    });

    await assert.rejects(addSupplierService(createSupplier), error);
  });

  it("returns null without querying when an update has no fields", async (t) => {
    const query = t.mock.method(pool, "query");

    assert.equal(await updateSupplierService("supplier-1", {}), null);
    assert.equal(query.mock.calls.length, 0);
  });

  it("updates only supplied fields and returns the updated row", async (t) => {
    const query = t.mock.method(pool, "query", async () => ({
      rows: [supplier],
      rowCount: 1,
    }));
    const update = { name: "Updated Cafe", is_active: false };

    assert.equal(await updateSupplierService("supplier-1", update), supplier);
    assert.match(query.mock.calls[0].arguments[0] as string, /name = \$2, is_active = \$3/);
    assert.deepEqual(query.mock.calls[0].arguments[1], ["supplier-1", "Updated Cafe", false]);
  });

  it("returns null when the supplier to update does not exist", async (t) => {
    t.mock.method(pool, "query", async () => ({ rows: [], rowCount: 0 }));

    assert.equal(await updateSupplierService("missing", { name: "Updated Cafe" }), null);
  });

  it("propagates database failures when updating a supplier", async (t) => {
    const error = new Error("database unavailable");
    t.mock.method(pool, "query", async () => {
      throw error;
    });

    await assert.rejects(updateSupplierService("supplier-1", { name: "Updated Cafe" }), error);
  });

  it("deactivates an existing supplier", async (t) => {
    const query = t.mock.method(pool, "query", async () => ({
      rows: [{ ...supplier, is_active: false }],
      rowCount: 1,
    }));

    assert.equal((await deactivateSupplierService("supplier-1"))?.is_active, false);
    assert.deepEqual(query.mock.calls[0].arguments[1], ["supplier-1"]);
    assert.match(query.mock.calls[0].arguments[0] as string, /is_active = false/);
  });

  it("returns null when the supplier to deactivate does not exist", async (t) => {
    t.mock.method(pool, "query", async () => ({ rows: [], rowCount: 0 }));

    assert.equal(await deactivateSupplierService("missing"), null);
  });

  it("propagates database failures when deactivating a supplier", async (t) => {
    const error = new Error("database unavailable");
    t.mock.method(pool, "query", async () => {
      throw error;
    });

    await assert.rejects(deactivateSupplierService("supplier-1"), error);
  });

  it("adds a favourite for the given user and supplier", async (t) => {
    const favourite = { user_id: "user-1", supplier_id: "supplier-1" };
    const query = t.mock.method(pool, "query", async () => ({
      rows: [favourite],
      rowCount: 1,
    }));

    assert.equal(await addFavouriteService("supplier-1", "user-1"), favourite);
    assert.deepEqual(query.mock.calls[0].arguments[1], ["user-1", "supplier-1"]);
  });

  it("propagates database failures when adding a favourite", async (t) => {
    const error = new Error("duplicate favourite");
    t.mock.method(pool, "query", async () => {
      throw error;
    });

    await assert.rejects(addFavouriteService("supplier-1", "user-1"), error);
  });

  it("returns true when a favourite is deleted", async (t) => {
    const query = t.mock.method(pool, "query", async () => ({
      rows: [],
      rowCount: 1,
    }));

    assert.equal(await deleteFavouriteService("supplier-1", "user-1"), true);
    assert.deepEqual(query.mock.calls[0].arguments[1], ["user-1", "supplier-1"]);
  });

  it("returns false when no favourite was deleted, including a null row count", async (t) => {
    t.mock.method(pool, "query", async () => ({ rows: [], rowCount: 0 }));
    assert.equal(await deleteFavouriteService("supplier-1", "user-1"), false);

    t.mock.method(pool, "query", async () => ({ rows: [], rowCount: null }));
    assert.equal(await deleteFavouriteService("supplier-1", "user-1"), false);
  });

  it("propagates database failures when deleting a favourite", async (t) => {
    const error = new Error("database unavailable");
    t.mock.method(pool, "query", async () => {
      throw error;
    });

    await assert.rejects(deleteFavouriteService("supplier-1", "user-1"), error);
  });
});
