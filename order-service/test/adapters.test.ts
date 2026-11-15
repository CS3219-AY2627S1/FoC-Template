/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Tests for the stub session verifier, supplier directory, credit bus and adapter
 *        configuration, written before the implementation per the approved plan.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Added the restart test for StubCreditBus.restore().
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: Tests for http adapter modes and settings, the HTTP session verifier and the HTTP
 *        supplier directory, per the User and Supplier integration plan.
 * Author review: Reviewed and approved by @mattis.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { Pool } from "pg";
import { StubCreditBus } from "../src/adapters/creditBus";
import { HttpSessionVerifier, StubSessionVerifier } from "../src/adapters/sessionVerifier";
import { HttpSupplierDirectory, STUB_SUPPLIERS, StubSupplierDirectory } from "../src/adapters/supplierDirectory";
import { UpstreamContractError, UpstreamUnavailableError } from "../src/adapters/upstream";
import { loadAdapterConfig } from "../src/config";
import { sweepDeadlines } from "../src/deadlines/sweeper";
import { applyTransition, createErrand } from "../src/errands/repository";
import type { Actor, Errand } from "../src/errands/errand";
import { publishOutboxBatch, type OutboxMessage } from "../src/outbox";
import { createTestDatabase, type TestDatabase } from "./helpers";

let db: TestDatabase;
let pool: Pool;
let bus: StubCreditBus;
let logged: Record<string, unknown>[];

before(async () => {
  db = await createTestDatabase();
  pool = db.pool;
});
after(async () => db.drop());
beforeEach(() => {
  bus = new StubCreditBus(pool, { limit: 100, delayMs: 0, silentAmount: 999 });
  logged = [];
  const capture = (line: string) => void logged.push(JSON.parse(line));
  mock.method(console, "log", capture);
  mock.method(console, "error", capture);
});
afterEach(() => mock.restoreAll());

const HOUR = 3_600_000;
const REQUESTER = "a1111111-1111-4111-8111-111111111111";
const COURIER = "b2222222-2222-4222-8222-222222222222";
const member = (id: string): Actor => ({ kind: "user", id, role: "MEMBER" });

async function newErrand(creditAmount: number): Promise<Errand> {
  const now = Date.now();
  return createErrand(
    pool,
    REQUESTER,
    {
      supplierId: STUB_SUPPLIERS[0].id,
      items: [{ name: "Latte", quantity: 1 }],
      dropoffLocation: "COM2 lobby",
      notes: null,
      creditAmount,
      listingDeadline: new Date(now + HOUR),
      pickupDeadline: new Date(now + 2 * HOUR),
      deliveryDeadline: new Date(now + 3 * HOUR),
    },
    STUB_SUPPLIERS[0],
  );
}

async function flush(): Promise<void> {
  await publishOutboxBatch(pool, (m) => bus.publish(m));
  await bus.idle();
}
async function state(id: string): Promise<{ state: string; rejection_reason: string | null }> {
  const { rows } = await pool.query("SELECT state, rejection_reason FROM errands WHERE id = $1", [id]);
  return rows[0];
}
async function step(id: string, action: "accept" | "pickup" | "deliver" | "confirm"): Promise<void> {
  const actor = action === "confirm" ? member(REQUESTER) : member(COURIER);
  assert.equal((await applyTransition(pool, id, action, actor)).ok, true, action);
}
function terminal(orderId: string, over: Record<string, unknown> = {}): OutboxMessage {
  return {
    eventId: randomUUID(),
    topic: "credit.commands",
    key: orderId,
    createdAt: new Date(),
    payload: {
      type: "OrderCancelled", schema_version: 1, operation_id: randomUUID(), order_id: orderId,
      requester_id: REQUESTER, courier_id: null, amount: 10, occurred_at: new Date().toISOString(), ...over,
    },
  };
}

describe("stub credit bus", () => {
  it("stub bus opens errand within limit", async () => {
    const e = await newErrand(10);
    await flush();
    assert.equal((await state(e.id)).state, "OPEN");
    assert.equal(bus.hold(e.id)?.status, "HELD");
  });

  it("stub bus rejects over limit", async () => {
    const e = await newErrand(150);
    await flush();
    const s = await state(e.id);
    assert.equal(s.state, "RESERVATION_REJECTED");
    assert.equal(s.rejection_reason, "INSUFFICIENT_CREDIT");
  });

  it("silent reply ends in timeout and the hold is released", async () => {
    const e = await newErrand(999);
    await flush();
    assert.equal((await state(e.id)).state, "PENDING_RESERVATION");
    assert.equal(bus.hold(e.id)?.status, "HELD");
    await sweepDeadlines(pool, new Date(e.reservationDeadline.getTime() + 1000));
    await flush();
    assert.equal((await state(e.id)).state, "RESERVATION_TIMED_OUT");
    assert.equal(bus.hold(e.id)?.status, "RELEASED");
    assert.deepEqual(bus.violations(), []);
  });

  it("stub bus makes no hold for a rejected reserve, so a terminal event breaks rule 3", async () => {
    const e = await newErrand(150);
    await flush();
    assert.equal(bus.hold(e.id), undefined);
    await bus.publish([terminal(e.id)]);
    assert.equal(bus.violations().length, 1);
    assert.match(bus.violations()[0], /rule 3/);
  });

  it("stub bus treats ReservationTimedOut after a rejected reserve as a no-op", async () => {
    const e = await newErrand(150);
    await flush();
    const m = terminal(e.id, { type: "ReservationTimedOut", amount: 150 });
    delete m.payload.courier_id;
    await bus.publish([m]);
    assert.deepEqual(bus.violations(), []);
    assert.equal(bus.hold(e.id), undefined);
  });

  it("stub bus flags a terminal event sent before the reserve reply is delivered", async () => {
    bus = new StubCreditBus(pool, { limit: 100, delayMs: 100, silentAmount: 999 });
    const e = await newErrand(10);
    await publishOutboxBatch(pool, (m) => bus.publish(m));
    await bus.publish([terminal(e.id)]);
    assert.equal(bus.violations().length, 1);
    assert.match(bus.violations()[0], /rule 3/);
    assert.equal(bus.hold(e.id)?.status, "HELD");
    await bus.idle();
    assert.equal((await state(e.id)).state, "OPEN");
  });

  it("stub bus accepts a full lifecycle with no violations", async () => {
    const e = await newErrand(10);
    await flush();
    for (const a of ["accept", "pickup", "deliver", "confirm"] as const) await step(e.id, a);
    await flush();
    assert.equal((await state(e.id)).state, "COMPLETED");
    assert.deepEqual(bus.violations(), []);
    assert.equal(bus.hold(e.id)?.status, "CAPTURED");
  });

  it("stub bus flags a terminal event with the wrong amount", async () => {
    const e = await newErrand(10);
    await flush();
    await bus.publish([terminal(e.id, { amount: 11 })]);
    assert.equal(bus.violations().length, 1);
    assert.match(bus.violations()[0], /amount/);
    assert.equal(bus.hold(e.id)?.status, "HELD");
    assert.ok(logged.some((l) => l.event === "credit.stub.contract_violation"));
  });

  it("a restarted bus rebuilds its holds from published rows: no false violation", async () => {
    const e = await newErrand(10);
    await flush();
    for (const a of ["accept", "pickup", "deliver"] as const) await step(e.id, a);
    assert.equal((await state(e.id)).state, "DELIVERED");

    const bus2 = new StubCreditBus(pool, { limit: 100, delayMs: 0, silentAmount: 999 });
    await bus2.restore();
    assert.equal(bus2.hold(e.id)?.status, "HELD");
    await step(e.id, "confirm");
    await publishOutboxBatch(pool, (m) => bus2.publish(m));
    await bus2.idle();
    assert.deepEqual(bus2.violations(), []);
    assert.equal(bus2.hold(e.id)?.status, "CAPTURED");
  });

  it("stub bus ignores a duplicate terminal event", async () => {
    const e = await newErrand(10);
    await flush();
    const m = terminal(e.id, { type: "OrderCompleted", courier_id: COURIER });
    await bus.publish([m]);
    await bus.publish([m]);
    assert.equal(bus.hold(e.id)?.status, "CAPTURED");
    assert.deepEqual(bus.violations(), []);
    assert.equal(logged.filter((l) => l.event === "credit.stub.duplicate").length, 1);
  });

  it("stub bus flags a different closing message after the hold is finalised", async () => {
    const e = await newErrand(10);
    await flush();
    await bus.publish([terminal(e.id), terminal(e.id, { type: "OrderExpired" })]);
    assert.equal(bus.hold(e.id)?.status, "RELEASED");
    assert.equal(bus.violations().length, 1);
  });

  it("stub bus flags a missing hold and a broken courier_id rule", async () => {
    const e = await newErrand(10);
    await flush();
    await bus.publish([terminal(randomUUID())]);
    await bus.publish([terminal(e.id, { type: "OrderCompleted", courier_id: REQUESTER })]);
    await bus.publish([terminal(e.id, { courier_id: COURIER })]);
    await bus.publish([terminal(e.id, { schema_version: 2 })]);
    assert.equal(bus.violations().length, 4);
    assert.equal(bus.hold(e.id)?.status, "HELD");
  });

  it("stub bus treats ReservationTimedOut without a hold as harmless", async () => {
    const m = terminal(randomUUID(), { type: "ReservationTimedOut" });
    delete m.payload.courier_id;
    await bus.publish([m]);
    assert.deepEqual(bus.violations(), []);
  });
});

describe("stub session verifier", () => {
  it("stub verifier parses role and rejects malformed tokens", async () => {
    const v = new StubSessionVerifier();
    const id = "A1111111-1111-4111-8111-111111111111";
    assert.deepEqual(await v.verify(`Bearer stub.${id}.MEMBER`), { id: id.toLowerCase(), role: "MEMBER" });
    assert.deepEqual(await v.verify(`Bearer stub.${REQUESTER}.ADMINISTRATOR`), { id: REQUESTER, role: "ADMINISTRATOR" });
    for (const bad of [
      undefined, "", "Bearer", `stub.${REQUESTER}.MEMBER`, `Bearer stub.${REQUESTER}.member`, `Bearer stub.${REQUESTER}.ROOT`,
      "Bearer stub.not-a-uuid.MEMBER", `Bearer stub.${REQUESTER}.MEMBER.x`, `bearer stub.${REQUESTER}.MEMBER`, `Bearer  stub.${REQUESTER}.MEMBER`,
    ]) {
      assert.equal(await v.verify(bad), null, String(bad));
    }
  });
});

describe("stub supplier directory", () => {
  it("returns the three fixed suppliers as active and unknown ids as unavailable", async () => {
    const d = new StubSupplierDirectory();
    assert.equal(STUB_SUPPLIERS.length, 3);
    for (const n of [1, 2, 3]) {
      const id = `00000000-0000-4000-8000-00000000000${n}`;
      const r = await d.findSupplier(id, "Bearer x");
      assert.equal(r.kind === "active" && r.supplier.id, id);
    }
    assert.deepEqual(await d.findSupplier(randomUUID(), "Bearer x"), { kind: "unavailable" });
  });
});

const CONFIG_KEYS = [
  "AUTH_MODE", "SUPPLIER_MODE", "CREDIT_MODE", "STUB_CREDIT_LIMIT", "STUB_CREDIT_DELAY_MS", "STUB_CREDIT_SILENT_AMOUNT",
  "USER_SERVICE_BASE_URL", "USER_SERVICE_VERIFY_TIMEOUT_MS", "SUPPLIER_SERVICE_BASE_URL", "SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS",
];

describe("adapter config", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    for (const k of CONFIG_KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of CONFIG_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("config rejects AUTH_MODE=user-service", () => {
    process.env.AUTH_MODE = "user-service";
    assert.throws(() => loadAdapterConfig(), /^Error: AUTH_MODE=user-service is not implemented yet$/);
  });

  it("config defaults to stubs with limit 100, delay 500 and silent amount 999", () => {
    assert.deepEqual(loadAdapterConfig(), {
      authMode: "stub", supplierMode: "stub", creditMode: "stub",
      stubCreditLimit: 100, stubCreditDelayMs: 500, stubCreditSilentAmount: 999,
    });
  });

  it("config accepts AUTH_MODE=http with base URL and default timeout 1000", () => {
    process.env.AUTH_MODE = "http";
    process.env.USER_SERVICE_BASE_URL = "http://user-service:3001";
    const c = loadAdapterConfig();
    assert.equal(c.authMode, "http");
    assert.deepEqual(c.userService, { baseUrl: "http://user-service:3001", timeoutMs: 1000 });
  });

  it("config accepts SUPPLIER_MODE=http with default timeout 2000", () => {
    process.env.SUPPLIER_MODE = "http";
    process.env.SUPPLIER_SERVICE_BASE_URL = "http://supplier-service:3000";
    const c = loadAdapterConfig();
    assert.equal(c.supplierMode, "http");
    assert.deepEqual(c.supplierService, { baseUrl: "http://supplier-service:3000", timeoutMs: 2000 });
  });

  it("config reads both timeouts", () => {
    process.env.AUTH_MODE = "http";
    process.env.USER_SERVICE_BASE_URL = "http://user-service:3001";
    process.env.USER_SERVICE_VERIFY_TIMEOUT_MS = "1500";
    process.env.SUPPLIER_MODE = "http";
    process.env.SUPPLIER_SERVICE_BASE_URL = "http://supplier-service:3000";
    process.env.SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS = "2500";
    const c = loadAdapterConfig();
    assert.equal(c.userService?.timeoutMs, 1500);
    assert.equal(c.supplierService?.timeoutMs, 2500);
  });

  it("config refuses http mode without a base URL", () => {
    process.env.AUTH_MODE = "http";
    assert.throws(() => loadAdapterConfig(), /^Error: USER_SERVICE_BASE_URL is not set$/);
    delete process.env.AUTH_MODE;
    process.env.SUPPLIER_MODE = "http";
    assert.throws(() => loadAdapterConfig(), /^Error: SUPPLIER_SERVICE_BASE_URL is not set$/);
  });

  it("config refuses a base URL that is not http(s)", () => {
    process.env.AUTH_MODE = "http";
    process.env.USER_SERVICE_BASE_URL = "ftp://x";
    assert.throws(() => loadAdapterConfig(), /USER_SERVICE_BASE_URL must be an http or https URL/);
  });

  it("config refuses a timeout of 0", () => {
    process.env.AUTH_MODE = "http";
    process.env.USER_SERVICE_BASE_URL = "http://user-service:3001";
    process.env.USER_SERVICE_VERIFY_TIMEOUT_MS = "0";
    assert.throws(() => loadAdapterConfig(), /USER_SERVICE_VERIFY_TIMEOUT_MS must be a whole number >= 1/);
  });

  it("config leaves userService undefined in stub mode", () => {
    const c = loadAdapterConfig();
    assert.equal(c.userService, undefined);
    assert.equal(c.supplierService, undefined);
  });

  it("config rejects CREDIT_MODE=http", () => {
    process.env.CREDIT_MODE = "http";
    assert.throws(() => loadAdapterConfig(), /^Error: CREDIT_MODE must be stub or kafka, not http$/);
  });
});

// A fetch stand-in that records each call and answers with `respond`
type FetchCall = { url: string; init: RequestInit };
export function fakeFetch(respond: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const f = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { fetch: f, calls };
}
const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body), { status });
// Never answers; rejects only when the caller's signal aborts. AbortSignal.timeout() does not keep
// the event loop alive and a fake has no socket, so hold a timer open until the abort.
const hang = (call: FetchCall) =>
  new Promise<Response>((_, reject) => {
    const keepAlive = setTimeout(() => {}, 5000);
    call.init.signal?.addEventListener("abort", () => {
      clearTimeout(keepAlive);
      reject(call.init.signal!.reason);
    });
  });
const networkError = () => Promise.reject(new TypeError("fetch failed"));

describe("http session verifier", () => {
  const USER = { baseUrl: "http://user-service:3001", timeoutMs: 1000 };
  const id = randomUUID();

  it("http verifier forwards the header to /auth/verify and returns the principal", async () => {
    const f = fakeFetch(() => reply(200, { id: id.toUpperCase(), role: "MEMBER" }));
    const p = await new HttpSessionVerifier(USER, f.fetch).verify("Bearer abc.def");
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, "http://user-service:3001/auth/verify");
    assert.equal(f.calls[0].init.method ?? "GET", "GET");
    assert.equal(new Headers(f.calls[0].init.headers).get("authorization"), "Bearer abc.def");
    assert.deepEqual(p, { id, role: "MEMBER" });
  });

  it("http verifier returns null on 401", async () => {
    const f = fakeFetch(() => reply(401, { error: "UNAUTHENTICATED" }));
    assert.equal(await new HttpSessionVerifier(USER, f.fetch).verify("Bearer x"), null);
  });

  it("http verifier returns null without calling User when the header is missing", async () => {
    const f = fakeFetch(() => reply(200, { id, role: "MEMBER" }));
    assert.equal(await new HttpSessionVerifier(USER, f.fetch).verify(undefined), null);
    assert.equal(f.calls.length, 0);
  });

  it("http verifier throws UpstreamUnavailableError on 500, 503 and a network error", async () => {
    for (const respond of [() => reply(500), () => reply(503), networkError]) {
      await assert.rejects(new HttpSessionVerifier(USER, fakeFetch(respond).fetch).verify("Bearer x"), UpstreamUnavailableError);
    }
  });

  it("http verifier throws UpstreamUnavailableError after the timeout", async () => {
    const started = Date.now();
    await assert.rejects(
      new HttpSessionVerifier({ ...USER, timeoutMs: 50 }, fakeFetch(hang).fetch).verify("Bearer x"),
      UpstreamUnavailableError,
    );
    assert.ok(Date.now() - started < 1000);
  });

  it("http verifier throws UpstreamContractError on 403 and 404", async () => {
    for (const status of [403, 404]) {
      await assert.rejects(new HttpSessionVerifier(USER, fakeFetch(() => reply(status)).fetch).verify("Bearer x"), UpstreamContractError);
    }
  });

  it("http verifier throws UpstreamContractError on an unexpected 200 body", async () => {
    for (const body of [{ id: "x", role: "MEMBER" }, { id, role: "SUPPORT" }, { role: "MEMBER" }, "not json"]) {
      await assert.rejects(new HttpSessionVerifier(USER, fakeFetch(() => reply(200, body)).fetch).verify("Bearer x"), UpstreamContractError);
    }
  });
});

describe("http supplier directory", () => {
  const SUPPLIER = { baseUrl: "http://supplier-service:3000/", timeoutMs: 2000 };
  const id = randomUUID();
  const body = (over: Record<string, unknown> = {}) => ({
    id, name: "Coffee Bean", buildingCode: "COM3", buildingLabel: "COM3", locationDescription: "Ground floor",
    status: "ACTIVE", version: 3, archivedAt: null, ...over,
  });
  const lookup = (respond: Parameters<typeof fakeFetch>[0], cfg = SUPPLIER) =>
    new HttpSupplierDirectory(cfg, fakeFetch(respond).fetch).findSupplier(id, "Bearer abc.def");

  it("http directory forwards the header and maps an ACTIVE supplier", async () => {
    const f = fakeFetch(() => reply(200, body()));
    const r = await new HttpSupplierDirectory(SUPPLIER, f.fetch).findSupplier(id, "Bearer abc.def");
    assert.equal(f.calls[0].url, `http://supplier-service:3000/api/v1/suppliers/${id}`);
    assert.equal(new Headers(f.calls[0].init.headers).get("authorization"), "Bearer abc.def");
    assert.deepEqual(r, { kind: "active", supplier: { id, name: "Coffee Bean", buildingCode: "COM3", locationDescription: "Ground floor" } });
  });

  it("http directory maps ARCHIVED to archived, 404 to unavailable and 401 to unauthenticated", async () => {
    assert.deepEqual(await lookup(() => reply(200, body({ status: "ARCHIVED", archivedAt: "2026-10-01T00:00:00Z" }))), { kind: "archived" });
    assert.deepEqual(await lookup(() => reply(404, { error: "NOT_FOUND" })), { kind: "unavailable" });
    assert.deepEqual(await lookup(() => reply(401, { error: "UNAUTHENTICATED" })), { kind: "unauthenticated" });
  });

  it("http directory throws UpstreamContractError on 400, 403 and an unexpected 200 body", async () => {
    for (const respond of [
      () => reply(400), () => reply(403),
      () => reply(200, body({ status: "DELETED" })), () => reply(200, body({ name: undefined })),
      () => reply(200, body({ buildingCode: "" })), () => reply(200, "not json"),
    ]) {
      await assert.rejects(lookup(respond), UpstreamContractError);
    }
  });

  it("http directory throws UpstreamUnavailableError on 502, a network error and a timeout", async () => {
    await assert.rejects(lookup(() => reply(502)), UpstreamUnavailableError);
    await assert.rejects(lookup(networkError), UpstreamUnavailableError);
    await assert.rejects(lookup(hang, { ...SUPPLIER, timeoutMs: 50 }), UpstreamUnavailableError);
  });
});
