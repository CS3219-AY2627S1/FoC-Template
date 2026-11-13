// AI Assistance Disclosure:
// Tool: GitHub Copilot (Copilot SDK in VS Code), date: 2026-11-10
// Scope: Added isolated unit tests for wallet and credit transaction service functions.
// Author review: Tests reviewed and verified by author

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TestContext } from "node:test";
import type { PoolClient } from "pg";
import pool from "../src/config/db.ts";
import {
  getTransactionsByUserService,
  releaseCreditsOnceService,
  releaseCreditsService,
  reserveCreditsService,
  transferCreditsService,
} from "../src/service/transactionService.ts";
import { getWalletService, initializeWalletService } from "../src/service/walletService.ts";

type QueryResult = {
  rows: object[];
  rowCount: number | null;
};

type QueryCall = {
  sql: string;
  values?: unknown[];
};

const transaction = {
  user_id: "requester-1",
  order_id: "order-1",
  type: "RESERVE",
  amount: 4,
};

const emptyResult = (): QueryResult => ({ rows: [], rowCount: 0 });

const createClient = (
  t: TestContext,
  responses: Array<QueryResult | Error>,
) => {
  const calls: QueryCall[] = [];
  let released = false;
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      const response = responses.shift() ?? emptyResult();
      if (response instanceof Error) {
        throw response;
      }
      return response;
    },
    release: () => {
      released = true;
    },
  };

  t.mock.method(pool, "connect", async () => client as PoolClient);

  return {
    calls,
    isReleased: () => released,
  };
};

describe("credit service", () => {
  it("initializes a wallet with configured starting credits", async (t) => {
    const previous = process.env.INITIAL_CREDITS;
    t.after(() => {
      if (previous === undefined) {
        delete process.env.INITIAL_CREDITS;
      } else {
        process.env.INITIAL_CREDITS = previous;
      }
    });
    process.env.INITIAL_CREDITS = "25";
    const wallet = { user_id: "user-1", available_credits: 25, reserved_credits: 0 };
    const query = t.mock.method(pool, "query", async () => ({
      rows: [wallet],
      rowCount: 1,
    }));

    assert.equal(await initializeWalletService("user-1"), wallet);
    assert.deepEqual(query.mock.calls[0].arguments[1], ["user-1", 25]);
    assert.match(query.mock.calls[0].arguments[0] as string, /WHERE available_credits > 0/);
  });

  it("uses ten initial credits by default and supports zero starting credits", async (t) => {
    const previous = process.env.INITIAL_CREDITS;
    t.after(() => {
      if (previous === undefined) {
        delete process.env.INITIAL_CREDITS;
      } else {
        process.env.INITIAL_CREDITS = previous;
      }
    });
    delete process.env.INITIAL_CREDITS;

    const query = t.mock.method(pool, "query", async () => ({
      rows: [{ user_id: "user-1", available_credits: 10, reserved_credits: 0 }],
      rowCount: 1,
    }));
    await initializeWalletService("user-1");
    assert.deepEqual(query.mock.calls[0].arguments[1], ["user-1", 10]);

    process.env.INITIAL_CREDITS = "0";
    await initializeWalletService("user-1");
    assert.deepEqual(query.mock.calls[1].arguments[1], ["user-1", 0]);
  });

  it("propagates database failures when initializing a wallet", async (t) => {
    const error = new Error("database unavailable");
    t.mock.method(pool, "query", async () => {
      throw error;
    });

    await assert.rejects(initializeWalletService("user-1"), error);
  });

  it("returns the user's wallet when it exists", async (t) => {
    const wallet = { user_id: "user-1", available_credits: 10, reserved_credits: 2 };
    const query = t.mock.method(pool, "query", async () => ({
      rows: [wallet],
      rowCount: 1,
    }));

    assert.equal(await getWalletService("user-1"), wallet);
    assert.deepEqual(query.mock.calls[0].arguments[1], ["user-1"]);
  });

  it("returns null when the user has no wallet", async (t) => {
    t.mock.method(pool, "query", async () => ({ rows: [], rowCount: 0 }));

    assert.equal(await getWalletService("missing"), null);
  });

  it("propagates database failures when fetching a wallet", async (t) => {
    const error = new Error("database unavailable");
    t.mock.method(pool, "query", async () => {
      throw error;
    });

    await assert.rejects(getWalletService("user-1"), error);
  });

  it("returns a user's transactions in the database-provided order", async (t) => {
    const rows = [transaction, { ...transaction, type: "INITIAL" }];
    const query = t.mock.method(pool, "query", async () => ({
      rows,
      rowCount: rows.length,
    }));

    assert.deepEqual(await getTransactionsByUserService("requester-1"), rows);
    assert.match(query.mock.calls[0].arguments[0] as string, /ORDER BY created_at DESC/);
    assert.deepEqual(query.mock.calls[0].arguments[1], ["requester-1"]);
  });

  it("returns an empty transaction list and propagates query errors", async (t) => {
    t.mock.method(pool, "query", async () => ({ rows: [], rowCount: 0 }));
    assert.deepEqual(await getTransactionsByUserService("user-1"), []);

    const error = new Error("database unavailable");
    t.mock.method(pool, "query", async () => {
      throw error;
    });
    await assert.rejects(getTransactionsByUserService("user-1"), error);
  });

  it("reserves available credits and commits the transaction", async (t) => {
    const client = createClient(t, [
      emptyResult(),
      { rows: [{}], rowCount: 1 },
      { rows: [transaction], rowCount: 1 },
      emptyResult(),
    ]);

    assert.equal(
      await reserveCreditsService({
        requester_id: "requester-1",
        order_id: "order-1",
        amount: 4,
      }),
      transaction,
    );
    assert.deepEqual(client.calls.map(({ sql }) => sql.trim().split(/\s+/)[0]), [
      "BEGIN",
      "UPDATE",
      "INSERT",
      "COMMIT",
    ]);
    assert.deepEqual(client.calls[1].values, [4, "requester-1"]);
    assert.deepEqual(client.calls[2].values, ["requester-1", "order-1", 4]);
    assert.equal(client.isReleased(), true);
  });

  it("rolls back and releases the client when reservation has insufficient funds", async (t) => {
    const client = createClient(t, [emptyResult(), emptyResult(), emptyResult()]);

    await assert.rejects(
      reserveCreditsService({ requester_id: "requester-1", order_id: "order-1", amount: 4 }),
      /Insufficient available credits or wallet not found/,
    );
    assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
    assert.equal(client.isReleased(), true);
  });

  it("rolls back a reservation after a database failure", async (t) => {
    const error = new Error("insert failed");
    const client = createClient(t, [emptyResult(), { rows: [{}], rowCount: 1 }, error, emptyResult()]);

    await assert.rejects(
      reserveCreditsService({ requester_id: "requester-1", order_id: "order-1", amount: 4 }),
      error,
    );
    assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
    assert.equal(client.isReleased(), true);
  });

  it("transfers reserved credits to the courier and returns the courier record", async (t) => {
    const courierTransaction = { ...transaction, user_id: "courier-1", type: "CREDIT" };
    const client = createClient(t, [
      emptyResult(),
      { rows: [{}], rowCount: 1 },
      { rows: [{}], rowCount: 1 },
      { rows: [transaction, courierTransaction], rowCount: 2 },
      emptyResult(),
    ]);

    assert.equal(
      await transferCreditsService({
        requester_id: "requester-1",
        courier_id: "courier-1",
        order_id: "order-1",
        amount: 4,
      }),
      courierTransaction,
    );
    assert.deepEqual(client.calls[1].values, [4, "requester-1"]);
    assert.deepEqual(client.calls[2].values, [4, "courier-1"]);
    assert.deepEqual(client.calls[3].values, ["requester-1", "courier-1", "order-1", 4]);
    assert.equal(client.calls.at(-1)?.sql, "COMMIT");
    assert.equal(client.isReleased(), true);
  });

  it("rolls back and releases the client when the requester lacks reserved credits", async (t) => {
    const client = createClient(t, [emptyResult(), emptyResult(), emptyResult()]);

    await assert.rejects(
      transferCreditsService({
        requester_id: "requester-1",
        courier_id: "courier-1",
        order_id: "order-1",
        amount: 4,
      }),
      /Insufficient reserved credits for requester/,
    );
    assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
    assert.equal(client.isReleased(), true);
  });

  it("rolls back a transfer after a database failure", async (t) => {
    const error = new Error("courier update failed");
    const client = createClient(t, [
      emptyResult(),
      { rows: [{}], rowCount: 1 },
      error,
      emptyResult(),
    ]);

    await assert.rejects(
      transferCreditsService({
        requester_id: "requester-1",
        courier_id: "courier-1",
        order_id: "order-1",
        amount: 4,
      }),
      error,
    );
    assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
    assert.equal(client.isReleased(), true);
  });

  it("releases reserved credits back to the requester and commits", async (t) => {
    const release = { ...transaction, type: "RELEASE" };
    const client = createClient(t, [
      emptyResult(),
      { rows: [{}], rowCount: 1 },
      { rows: [release], rowCount: 1 },
      emptyResult(),
    ]);

    assert.equal(
      await releaseCreditsService({
        requester_id: "requester-1",
        order_id: "order-1",
        amount: 4,
      }),
      release,
    );
    assert.deepEqual(client.calls[1].values, [4, "requester-1"]);
    assert.deepEqual(client.calls[2].values, ["requester-1", "order-1", 4]);
    assert.equal(client.calls.at(-1)?.sql, "COMMIT");
    assert.equal(client.isReleased(), true);
  });

  it("rolls back and releases the client when reserved credits cannot be released", async (t) => {
    const client = createClient(t, [emptyResult(), emptyResult(), emptyResult()]);

    await assert.rejects(
      releaseCreditsService({ requester_id: "requester-1", order_id: "order-1", amount: 4 }),
      /Insufficient reserved credits or wallet not found/,
    );
    assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
    assert.equal(client.isReleased(), true);
  });

  it("rolls back a release after a database failure", async (t) => {
    const error = new Error("transaction insert failed");
    const client = createClient(t, [emptyResult(), { rows: [{}], rowCount: 1 }, error, emptyResult()]);

    await assert.rejects(
      releaseCreditsService({ requester_id: "requester-1", order_id: "order-1", amount: 4 }),
      error,
    );
    assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
    assert.equal(client.isReleased(), true);
  });

  it("returns the existing release on repeat expiration without moving wallet credits again", async (t) => {
    const existingRelease = { ...transaction, type: "RELEASE" };
    const client = createClient(t, [
      emptyResult(),
      emptyResult(),
      { rows: [existingRelease], rowCount: 1 },
      emptyResult(),
    ]);

    assert.equal(
      await releaseCreditsOnceService({
        requester_id: "requester-1",
        order_id: "order-1",
        amount: 4,
      }),
      existingRelease,
    );
    assert.match(client.calls[1].sql, /pg_advisory_xact_lock/);
    assert.deepEqual(client.calls[1].values, ["order-1"]);
    assert.match(client.calls[2].sql, /type = 'RELEASE'/);
    assert.equal(client.calls.length, 4);
    assert.equal(client.calls.at(-1)?.sql, "COMMIT");
    assert.equal(client.isReleased(), true);
  });

  it("releases credits once when no previous release exists", async (t) => {
    const release = { ...transaction, type: "RELEASE" };
    const client = createClient(t, [
      emptyResult(),
      emptyResult(),
      { rows: [], rowCount: 0 },
      { rows: [{}], rowCount: 1 },
      { rows: [release], rowCount: 1 },
      emptyResult(),
    ]);

    assert.equal(
      await releaseCreditsOnceService({
        requester_id: "requester-1",
        order_id: "order-1",
        amount: 4,
      }),
      release,
    );
    assert.deepEqual(client.calls[3].values, [4, "requester-1"]);
    assert.deepEqual(client.calls[4].values, ["requester-1", "order-1", 4]);
    assert.equal(client.calls.at(-1)?.sql, "COMMIT");
    assert.equal(client.isReleased(), true);
  });

  it("rolls back a one-time release when reserved credits are insufficient", async (t) => {
    const client = createClient(t, [
      emptyResult(),
      emptyResult(),
      { rows: [], rowCount: 0 },
      emptyResult(),
      emptyResult(),
    ]);

    await assert.rejects(
      releaseCreditsOnceService({
        requester_id: "requester-1",
        order_id: "order-1",
        amount: 4,
      }),
      /Insufficient reserved credits or wallet not found/,
    );
    assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
    assert.equal(client.isReleased(), true);
  });

  it("rolls back a one-time release after a database failure", async (t) => {
    const error = new Error("database unavailable");
    const client = createClient(t, [emptyResult(), error, emptyResult()]);

    await assert.rejects(
      releaseCreditsOnceService({
        requester_id: "requester-1",
        order_id: "order-1",
        amount: 4,
      }),
      error,
    );
    assert.equal(client.calls.at(-1)?.sql, "ROLLBACK");
    assert.equal(client.isReleased(), true);
  });
});
