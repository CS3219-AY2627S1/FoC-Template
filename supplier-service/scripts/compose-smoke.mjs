/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added an isolated, repeatable live integration check for the Supplier
 * authenticated read increment, including query bounds and correlated redacted
 * completion logging, against PostgreSQL and the real User Service.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; extended the
 * isolated live check to cover administrator mutations, concurrency, duplicate
 * detection, lifecycle no-ops, SQL state, concurrent update exclusion,
 * edit-preserving migration/seed reruns, and collision-safe project cleanup.
 * Author review of the third increment: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; split the final
 * review runner into focused scenarios and shared lifecycle-precondition checks
 * without changing the verified contract.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; verified the
 * issue #25 Swagger UI and generated Supplier OpenAPI JSON in the live stack.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27; added live
 * authentication and complete-response coverage for issue #33 metadata.
 * Contract decision and implementation reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-10-18; supplied
 * disposable User database credentials and an audit key required by the
 * current Compose stack for issue #42 CI.
 * Author review: Pending project-author review.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-10-18; supplied
 * disposable Credit database credentials now required by the Compose stack.
 * Author review: Reviewed and approved by @phuc project-author review.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectName = `foc-supplier-smoke-${process.pid}-${randomUUID().slice(0, 8)}`;
const supplierPort = "3900";
const userPort = "3901";
const supplierBaseUrl = `http://127.0.0.1:${supplierPort}`;
const userBaseUrl = `http://127.0.0.1:${userPort}`;
const printerId = "ac2288df-661c-5d78-bcc1-ac6bca30fe51";
const unknownSupplierId = "00000000-0000-4000-8000-000000000023";
const buildingCodeOptions = [
  { code: "COM2", label: "COM2" },
  { code: "COM3", label: "COM3" },
  { code: "CENTRAL_LIBRARY", label: "Central Library" },
  { code: "ENG_E3", label: "Engineering Block E3" },
  { code: "ENG_E4", label: "Engineering Block E4" },
  { code: "ENG_EA", label: "Engineering Block EA" },
  { code: "FRONTIER", label: "Frontier" },
  { code: "TERRACE", label: "Terrace" },
  { code: "THE_RIDGE", label: "The Ridge" },
  { code: "YIH", label: "Yusof Ishak House" },
  { code: "PGP", label: "Prince George's Park" },
  { code: "HSSML", label: "Hon Sui Sen Memorial Library" },
  { code: "MED_SCI_LIBRARY", label: "Medicine + Science Library" },
  { code: "AS8", label: "Block AS8" },
  { code: "INNOVATION_4_0", label: "innovation4.0" },
];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hugeEtag = `"v${"9".repeat(200)}"`;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const testEnvironment = {
  ...process.env,
  AUDIT_HMAC_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  CREDIT_DB_ADMIN_PASSWORD: "supplier-smoke-credit-admin-password",
  CREDIT_DB_APP_PASSWORD: "supplier-smoke-credit-runtime-password",
  CREDIT_DB_MIGRATION_PASSWORD: "supplier-smoke-credit-migration-password",
  JWT_SECRET: "supplier-smoke-only-jwt-secret-32-characters",
  SUPPLIER_DB_ADMIN_PASSWORD: "supplier-smoke-admin-password",
  SUPPLIER_DB_ADMIN_USER: "supplier_bootstrap",
  SUPPLIER_DB_NAME: "supplier",
  SUPPLIER_DB_MIGRATION_PASSWORD: "supplier-smoke-migration-password",
  SUPPLIER_DB_MIGRATION_USER: "supplier_migrator",
  SUPPLIER_DB_PASSWORD: "supplier-smoke-runtime-password",
  SUPPLIER_DB_USER: "supplier_app",
  USER_DB_ADMIN_PASSWORD: "supplier-smoke-user-admin-password",
  USER_DB_APP_PASSWORD: "supplier-smoke-user-runtime-password",
  USER_DB_MIGRATION_PASSWORD: "supplier-smoke-user-migration-password",
  ORDER_DB_ADMIN_PASSWORD: "supplier-smoke-order-admin-password",
  ORDER_DB_MIGRATION_PASSWORD: "supplier-smoke-order-migration-password",
  ORDER_DB_APP_PASSWORD: "supplier-smoke-order-runtime-password",
  USER_SERVICE_VERIFY_TIMEOUT_MS: "1000",
  ALLOWED_EMAIL_DOMAIN: "u.nus.edu",
  BOOTSTRAP_ADMIN_USERNAME: "supplier_smoke_admin",
  BOOTSTRAP_ADMIN_EMAIL: "supplier-smoke-admin@u.nus.edu",
  BOOTSTRAP_ADMIN_PASSWORD: "SupplierSmokeAdmin1",
  SUPPLIER_PORT: supplierPort,
  USER_PORT: userPort,
};

const createBody = {
  name: "Mutation Smoke Cafe\u0301",
  categories: ["FOOD", "COFFEE"],
  buildingCode: "COM3",
  floor: " 2 ",
  locationDescription: "North A\u030Atrium",
  latitude: 1.295,
  longitude: 103.774,
  hoursKind: "INTERVAL",
  opensAt: "09:00",
  closesAt: "17:00",
};

const updateBody = {
  name: "Mutation Smoke Hub",
  categories: ["PRINTING", "PICKUP_POINT"],
  buildingCode: "COM2",
  floor: null,
  locationDescription: "Outside COM2 level 1",
  latitude: null,
  longitude: null,
  hoursKind: "UNKNOWN",
};

const archivedUpdateBody = {
  name: "Mutation Smoke Hub Archived",
  categories: ["SHOPPING"],
  buildingCode: "COM2",
  floor: "B1",
  locationDescription: "Inside COM2 basement 1",
  latitude: null,
  longitude: null,
  hoursKind: "ALL_DAY",
};

let stackStarted = false;

function compose(args, options = {}) {
  return execFileSync(
    "docker",
    ["compose", "--project-name", projectName, ...args],
    {
      cwd: repoRoot,
      env: testEnvironment,
      encoding: "utf8",
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    },
  );
}

function resetStack() {
  compose(["down", "--volumes", "--remove-orphans"], { capture: true });
}

async function waitFor(url, description) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${description} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`${description} did not become ready`, { cause: lastError });
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = text === "" ? undefined : JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${url}, received: ${text}`);
  }
  return { response, body, text };
}

async function verifyOpenApiDocumentation() {
  const uiResponse = await fetch(`${supplierBaseUrl}/api/docs`);
  assert.equal(uiResponse.status, 200);
  assert.match(await uiResponse.text(), /FoC Supplier Service API/);

  const { response, body } = await jsonRequest(
    `${supplierBaseUrl}/api/docs-json`,
  );
  assert.equal(response.status, 200);
  assert.equal(body.info.title, "FoC Supplier Service API");
  assert.equal(body.info.version, "1.0.0");
  assert.equal(body.components.securitySchemes["supplier-bearer"].scheme, "bearer");
  assert.deepEqual(Object.keys(body.paths).sort(), [
    "/api/v1/suppliers",
    "/api/v1/suppliers/metadata",
    "/api/v1/suppliers/{id}",
    "/api/v1/suppliers/{id}/restore",
    "/health",
  ]);
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function login(identifier, password) {
  const { response, body } = await jsonRequest(`${userBaseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  assert.equal(response.status, 200, `login failed: ${JSON.stringify(body)}`);
  assert.equal(body.tokenType, "Bearer");
  assert.equal(typeof body.accessToken, "string");
  return body.accessToken;
}

async function supplierRequest(
  path,
  token,
  { method = "GET", headers = {}, body } = {},
) {
  const requestHeaders = { ...headers, ...bearer(token) };
  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }
  return jsonRequest(`${supplierBaseUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function assertStableNameOrder(items) {
  const keys = items.map(({ name, id }) => `${name}\0${id}`);
  assert.deepEqual(keys, [...keys].sort());
}

function assertError(result, status, code) {
  assert.equal(result.response.status, status, JSON.stringify(result.body));
  assert.equal(result.body.code, code);
  assert.equal(typeof result.body.message, "string");
  const requestId = result.response.headers.get("x-request-id");
  assert.match(requestId, uuidPattern);
  assert.equal(result.body.requestId, requestId);
}

function assertNoContent(result) {
  assert.equal(result.response.status, 204);
  assert.equal(result.text, "");
  assert.equal(result.body, undefined);
}

function assertUtcTimestamp(value) {
  assert.equal(typeof value, "string");
  assert.match(value, /Z$/);
  assert.equal(Number.isNaN(Date.parse(value)), false);
}

function assertLater(later, earlier) {
  assert.ok(
    Date.parse(later) > Date.parse(earlier),
    `expected ${later} to be later than ${earlier}`,
  );
}

function editableBody(detail) {
  const body = {
    name: detail.name,
    categories: detail.categories,
    buildingCode: detail.buildingCode,
    floor: detail.floor,
    locationDescription: detail.locationDescription,
    latitude: detail.latitude,
    longitude: detail.longitude,
    hoursKind: detail.hoursKind,
  };
  if (detail.hoursKind === "INTERVAL") {
    body.opensAt = detail.opensAt;
    body.closesAt = detail.closesAt;
  }
  return body;
}

function expectedEditableBody(body) {
  const expected = {
    name: body.name.trim(),
    categories: [...body.categories].sort(),
    buildingCode: body.buildingCode,
    floor:
      body.floor === undefined || body.floor === null || body.floor.trim() === ""
        ? null
        : body.floor.trim(),
    locationDescription: body.locationDescription.trim(),
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    hoursKind: body.hoursKind,
  };
  if (body.hoursKind === "INTERVAL") {
    expected.opensAt = body.opensAt.trim();
    expected.closesAt = body.closesAt.trim();
  }
  return expected;
}

function psql(sql, capture = false) {
  return compose(
    [
      "exec",
      "-T",
      "supplier-db",
      "psql",
      "--username",
      "supplier_bootstrap",
      "--dbname",
      "supplier",
      "--tuples-only",
      "--no-align",
      "--command",
      sql,
    ],
    { capture },
  );
}

function supplierCount() {
  return Number(psql("SELECT count(*) FROM suppliers;", true).trim());
}

function supplierIdCount(id) {
  assert.match(id, uuidPattern);
  return Number(
    psql(
      `SELECT count(*) FROM suppliers WHERE id = '${id}'::uuid;`,
      true,
    ).trim(),
  );
}

function supplierSnapshot(id) {
  assert.match(id, uuidPattern);
  const snapshot = psql(
    `SELECT (to_jsonb(s) || jsonb_build_object(
      'categories', COALESCE(
        (SELECT jsonb_agg(sc.category ORDER BY sc.category::text)
         FROM supplier_categories sc
         WHERE sc.supplier_id = s.id),
        '[]'::jsonb
      )
    ))::text
    FROM suppliers s
    WHERE s.id = '${id}'::uuid;`,
    true,
  ).trim();
  assert.notEqual(snapshot, "", `missing SQL Supplier ${id}`);
  return JSON.parse(snapshot);
}

function assertSnapshotMatchesResponse(snapshot, supplier) {
  assert.equal(snapshot.id, supplier.id);
  assert.equal(snapshot.name, supplier.name);
  assert.deepEqual(
    [...snapshot.categories].sort(),
    [...supplier.categories].sort(),
  );
  assert.equal(snapshot.building_code, supplier.buildingCode);
  assert.equal(snapshot.floor, supplier.floor);
  assert.equal(snapshot.location_description, supplier.locationDescription);
  assert.equal(
    snapshot.latitude === null ? null : Number(snapshot.latitude),
    supplier.latitude,
  );
  assert.equal(
    snapshot.longitude === null ? null : Number(snapshot.longitude),
    supplier.longitude,
  );
  assert.equal(snapshot.hours_kind, supplier.hoursKind);
  assert.equal(snapshot.opens_at?.slice(0, 5) ?? null, supplier.opensAt);
  assert.equal(snapshot.closes_at?.slice(0, 5) ?? null, supplier.closesAt);
  assert.equal(snapshot.image_path, supplier.imagePath);
  assert.equal(snapshot.status, supplier.status);
  assert.equal(snapshot.version, supplier.version);
  assert.equal(Date.parse(snapshot.created_at), Date.parse(supplier.createdAt));
  assert.equal(Date.parse(snapshot.updated_at), Date.parse(supplier.updatedAt));
  assert.equal(
    snapshot.archived_at === null ? null : Date.parse(snapshot.archived_at),
    supplier.archivedAt === null ? null : Date.parse(supplier.archivedAt),
  );
}

async function assertSupplierUnchanged(
  supplierId,
  token,
  expectedSnapshot,
  expectedEtag,
) {
  assert.deepEqual(supplierSnapshot(supplierId), expectedSnapshot);
  const detail = await supplierRequest(
    `/api/v1/suppliers/${supplierId}`,
    token,
  );
  assert.equal(detail.response.status, 200);
  assert.equal(detail.response.headers.get("etag"), expectedEtag);
}

async function prepareSmokeContext() {
  console.info(`Starting the dedicated Supplier smoke stack ${projectName}...`);
  compose(["up", "--detach", "--build", "--wait"]);
  stackStarted = true;

  await waitFor(`${supplierBaseUrl}/health`, "Supplier health");
  await waitFor(`${userBaseUrl}/health`, "User health");
  await verifyOpenApiDocumentation();

  assert.equal(supplierCount(), 21);
  const initialPrinterSnapshot = supplierSnapshot(printerId);
  assert.equal(initialPrinterSnapshot.status, "ACTIVE");
  assert.equal(initialPrinterSnapshot.version, 0);

  const registration = await jsonRequest(`${userBaseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "supplier_smoke_member",
      email: "supplier-smoke-member@u.nus.edu",
      password: "SupplierSmokeMember1",
    }),
  });
  assert.equal(registration.response.status, 201);
  assert.equal(registration.body.role, "MEMBER");

  const memberToken = await login(
    "supplier_smoke_member",
    "SupplierSmokeMember1",
  );
  const adminToken = await login(
    "supplier_smoke_admin",
    "SupplierSmokeAdmin1",
  );
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_100));
  const secondAdminToken = await login(
    "supplier_smoke_admin",
    "SupplierSmokeAdmin1",
  );
  assert.notEqual(secondAdminToken, adminToken);

  return {
    initialPrinterSnapshot,
    memberToken,
    adminToken,
    secondAdminToken,
  };
}

async function verifyCatalogueReadScenarios({
  initialPrinterSnapshot,
  memberToken,
  adminToken,
}) {
  const invalid = await jsonRequest(`${supplierBaseUrl}/api/v1/suppliers`, {
    headers: {
      Authorization: "Bearer invalid-token",
      "X-Request-Id": "client-chosen-id",
    },
  });
  assertError(invalid, 401, "UNAUTHENTICATED");
  assert.notEqual(
    invalid.response.headers.get("x-request-id"),
    "client-chosen-id",
  );

  const missingMetadataAuthentication = await jsonRequest(
    `${supplierBaseUrl}/api/v1/suppliers/metadata`,
  );
  assertError(missingMetadataAuthentication, 401, "UNAUTHENTICATED");

  const memberMetadata = await supplierRequest(
    "/api/v1/suppliers/metadata",
    memberToken,
  );
  assert.equal(memberMetadata.response.status, 200);
  assert.deepEqual(memberMetadata.body, { buildingCodes: buildingCodeOptions });

  const adminMetadata = await supplierRequest(
    "/api/v1/suppliers/metadata",
    adminToken,
  );
  assert.equal(adminMetadata.response.status, 200);
  assert.deepEqual(adminMetadata.body, memberMetadata.body);

  const defaultList = await supplierRequest("/api/v1/suppliers", memberToken);
  assert.equal(defaultList.response.status, 200);
  assert.equal(defaultList.body.totalItems, 21);
  assert.equal(defaultList.body.page, 0);
  assert.equal(defaultList.body.size, 12);
  assertStableNameOrder(defaultList.body.items);

  const descendingList = await supplierRequest(
    "/api/v1/suppliers?size=100&sort=name,desc",
    memberToken,
  );
  assert.equal(descendingList.response.status, 200);
  assert.equal(descendingList.body.totalItems, 21);
  const descendingNames = descendingList.body.items.map(({ name }) => name);
  assert.deepEqual(descendingNames, [...descendingNames].sort().reverse());

  const firstPage = await supplierRequest(
    "/api/v1/suppliers?size=5&page=0&sort=name,asc",
    memberToken,
  );
  const firstPageAgain = await supplierRequest(
    "/api/v1/suppliers?size=5&page=0&sort=name,asc",
    memberToken,
  );
  const secondPage = await supplierRequest(
    "/api/v1/suppliers?size=5&page=1&sort=name,asc",
    memberToken,
  );
  const firstIds = firstPage.body.items.map(({ id }) => id);
  assert.deepEqual(
    firstPageAgain.body.items.map(({ id }) => id),
    firstIds,
  );
  assert.equal(
    secondPage.body.items.some(({ id }) => firstIds.includes(id)),
    false,
  );

  const filtered = await supplierRequest(
    "/api/v1/suppliers?q=next%20to%20lt19&buildingCode=COM2&category=PRINTING",
    memberToken,
  );
  assert.equal(filtered.response.status, 200);
  assert.deepEqual(filtered.body.items.map(({ id }) => id), [printerId]);

  const maximumSearch = await supplierRequest(
    `/api/v1/suppliers?q=${"a".repeat(300)}`,
    memberToken,
  );
  assert.equal(maximumSearch.response.status, 200);

  const overlongSearch = await supplierRequest(
    `/api/v1/suppliers?q=${"a".repeat(301)}`,
    memberToken,
  );
  assertError(overlongSearch, 400, "SUPPLIER_VALIDATION_FAILED");
  assert.equal(typeof overlongSearch.body.fieldErrors.q, "string");

  const logProbeQuery = "must-not-appear-in-supplier-logs";
  const logProbe = await supplierRequest(
    `/api/v1/suppliers?q=${logProbeQuery}`,
    memberToken,
  );
  assert.equal(logProbe.response.status, 200);
  const logProbeRequestId = logProbe.response.headers.get("x-request-id");
  assert.match(logProbeRequestId, uuidPattern);
  const supplierLogs = compose(["logs", "--no-color", "supplier-service"], {
    capture: true,
  });
  const completionLines = supplierLogs
    .split("\n")
    .filter((line) => line.includes(logProbeRequestId));
  assert.equal(completionLines.length, 1);
  const jsonStart = completionLines[0].indexOf("{");
  assert.notEqual(jsonStart, -1);
  const completionLog = JSON.parse(completionLines[0].slice(jsonStart));
  assert.deepEqual(completionLog.message, {
    event: "supplier.http.request.completed",
    requestId: logProbeRequestId,
    method: "GET",
    pathname: "/api/v1/suppliers",
    status: 200,
    result: "completed",
    durationMs: completionLog.message.durationMs,
  });
  assert.equal(typeof completionLog.message.durationMs, "number");
  assert.equal(supplierLogs.includes(logProbeQuery), false);

  const printerDetail = await supplierRequest(
    `/api/v1/suppliers/${printerId}`,
    adminToken,
  );
  assert.equal(printerDetail.response.status, 200);
  assert.equal(printerDetail.response.headers.get("etag"), '"v0"');
  assert.equal(
    printerDetail.body.imagePath,
    "/assets/suppliers/PRINTER_COM2.jpeg",
  );
  assertSnapshotMatchesResponse(initialPrinterSnapshot, printerDetail.body);
  const initialPrinterBody = editableBody(printerDetail.body);

  const asset = await fetch(
    `${supplierBaseUrl}/assets/suppliers/PRINTER_COM2.jpeg`,
  );
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /^image\/jpeg/);
  assert.ok((await asset.arrayBuffer()).byteLength > 0);

  const unsafeOffset = await supplierRequest(
    `/api/v1/suppliers?page=${Number.MAX_SAFE_INTEGER}&size=100`,
    memberToken,
  );
  assertError(unsafeOffset, 400, "SUPPLIER_VALIDATION_FAILED");
  assert.equal(typeof unsafeOffset.body.fieldErrors.page, "string");

  return initialPrinterBody;
}

async function verifyMutationAccessAndCreateScenarios({
  initialPrinterSnapshot,
  initialPrinterBody,
  memberToken,
  adminToken,
}) {
  const memberMutationResults = await Promise.all([
    supplierRequest("/api/v1/suppliers", memberToken, {
      method: "POST",
      body: createBody,
    }),
    supplierRequest(`/api/v1/suppliers/${printerId}`, memberToken, {
      method: "PUT",
      headers: { "If-Match": '"v0"' },
      body: initialPrinterBody,
    }),
    supplierRequest(`/api/v1/suppliers/${printerId}`, memberToken, {
      method: "DELETE",
      headers: { "If-Match": '"v0"' },
    }),
    supplierRequest(
      `/api/v1/suppliers/${printerId}/restore`,
      memberToken,
      {
        method: "POST",
        headers: { "If-Match": '"v0"' },
      },
    ),
  ]);
  for (const result of memberMutationResults) {
    assertError(result, 403, "FORBIDDEN");
  }
  assert.equal(supplierCount(), 21);
  assert.deepEqual(supplierSnapshot(printerId), initialPrinterSnapshot);

  const invalidCreateBody = {
    ...createBody,
    id: unknownSupplierId,
    categories: ["FOOD", "FOOD"],
    hoursKind: "ALL_DAY",
    opensAt: "09:00",
  };
  delete invalidCreateBody.longitude;
  delete invalidCreateBody.closesAt;
  const invalidCreate = await supplierRequest(
    "/api/v1/suppliers",
    adminToken,
    { method: "POST", body: invalidCreateBody },
  );
  assertError(invalidCreate, 400, "SUPPLIER_VALIDATION_FAILED");
  for (const field of ["id", "categories", "latitude", "longitude", "opensAt"]) {
    assert.equal(typeof invalidCreate.body.fieldErrors[field], "string");
  }
  assert.equal(supplierCount(), 21);

  const concurrentCreates = await Promise.all([
    supplierRequest("/api/v1/suppliers", adminToken, {
      method: "POST",
      body: createBody,
    }),
    supplierRequest("/api/v1/suppliers", adminToken, {
      method: "POST",
      body: createBody,
    }),
  ]);
  assert.deepEqual(
    concurrentCreates.map(({ response }) => response.status).sort(),
    [201, 409],
  );
  const created = concurrentCreates.find(
    ({ response }) => response.status === 201,
  );
  const concurrentDuplicate = concurrentCreates.find(
    ({ response }) => response.status === 409,
  );
  assertError(concurrentDuplicate, 409, "SUPPLIER_ALREADY_EXISTS");
  const createdId = created.body.id;
  assert.match(createdId, uuidPattern);
  assert.equal(concurrentDuplicate.body.existingSupplierId, createdId);
  assert.equal(
    created.response.headers.get("location"),
    `/api/v1/suppliers/${createdId}`,
  );
  assert.equal(created.response.headers.get("etag"), '"v0"');
  assert.deepEqual(editableBody(created.body), expectedEditableBody(createBody));
  assert.equal(created.body.status, "ACTIVE");
  assert.equal(created.body.version, 0);
  assert.equal(created.body.imagePath, null);
  assert.equal(created.body.archivedAt, null);
  assertUtcTimestamp(created.body.createdAt);
  assertUtcTimestamp(created.body.updatedAt);
  assert.equal(created.body.createdAt, created.body.updatedAt);
  assert.equal(supplierCount(), 22);
  assert.equal(supplierIdCount(createdId), 1);
  const createdSnapshot = supplierSnapshot(createdId);
  assertSnapshotMatchesResponse(createdSnapshot, created.body);

  const memberCreatedDetail = await supplierRequest(
    `/api/v1/suppliers/${createdId}`,
    memberToken,
  );
  assert.equal(memberCreatedDetail.response.status, 200);
  assert.equal(memberCreatedDetail.response.headers.get("etag"), '"v0"');
  const memberCreatedList = await supplierRequest(
    "/api/v1/suppliers?q=Mutation%20Smoke&size=100",
    memberToken,
  );
  assert.equal(memberCreatedList.response.status, 200);
  assert.ok(memberCreatedList.body.items.some(({ id }) => id === createdId));

  const normalizedActiveDuplicate = await supplierRequest(
    "/api/v1/suppliers",
    adminToken,
    {
      method: "POST",
      body: {
        ...createBody,
        name: "mutation smoke caf\u00e9",
        floor: "2",
        locationDescription: "north \u00e5trium",
      },
    },
  );
  assertError(normalizedActiveDuplicate, 409, "SUPPLIER_ALREADY_EXISTS");
  assert.equal(normalizedActiveDuplicate.body.existingSupplierId, createdId);
  assert.equal(supplierCount(), 22);
  assert.deepEqual(supplierSnapshot(createdId), createdSnapshot);

  const unknownRequests = await Promise.all([
    supplierRequest(`/api/v1/suppliers/${unknownSupplierId}`, adminToken, {
      method: "PUT",
      headers: { "If-Match": '"v0"' },
      body: updateBody,
    }),
    supplierRequest(`/api/v1/suppliers/${unknownSupplierId}`, adminToken, {
      method: "DELETE",
      headers: { "If-Match": '"v0"' },
    }),
    supplierRequest(
      `/api/v1/suppliers/${unknownSupplierId}/restore`,
      adminToken,
      { method: "POST", headers: { "If-Match": '"v0"' } },
    ),
  ]);
  for (const result of unknownRequests) {
    assertError(result, 404, "SUPPLIER_NOT_FOUND");
  }
  assert.deepEqual(supplierSnapshot(createdId), createdSnapshot);

  return { created, createdId, createdSnapshot };
}

async function verifyUpdateScenarios({
  adminToken,
  secondAdminToken,
  created,
  createdId,
  createdSnapshot,
}) {
  const missingUpdatePrecondition = await supplierRequest(
    `/api/v1/suppliers/${createdId}`,
    adminToken,
    { method: "PUT", body: updateBody },
  );
  assertError(
    missingUpdatePrecondition,
    428,
    "SUPPLIER_PRECONDITION_REQUIRED",
  );
  await assertSupplierUnchanged(createdId, adminToken, createdSnapshot, '"v0"');

  for (const malformedEtag of [
    'W/"v0"',
    "*",
    '"v0", "v1"',
    "v0",
    '"v00"',
  ]) {
    const malformedUpdate = await supplierRequest(
      `/api/v1/suppliers/${createdId}`,
      adminToken,
      {
        method: "PUT",
        headers: { "If-Match": malformedEtag },
        body: updateBody,
      },
    );
    assertError(malformedUpdate, 400, "SUPPLIER_VALIDATION_FAILED");
    assert.equal(typeof malformedUpdate.body.fieldErrors.ifMatch, "string");
    await assertSupplierUnchanged(
      createdId,
      adminToken,
      createdSnapshot,
      '"v0"',
    );
  }

  for (const staleEtag of ['"v99"', hugeEtag]) {
    const staleUpdate = await supplierRequest(
      `/api/v1/suppliers/${createdId}`,
      adminToken,
      {
        method: "PUT",
        headers: { "If-Match": staleEtag },
        body: updateBody,
      },
    );
    assertError(staleUpdate, 412, "SUPPLIER_VERSION_CONFLICT");
    await assertSupplierUnchanged(
      createdId,
      adminToken,
      createdSnapshot,
      '"v0"',
    );
  }

  const invalidUpdate = await supplierRequest(
    `/api/v1/suppliers/${createdId}`,
    adminToken,
    {
      method: "PUT",
      headers: { "If-Match": '"v0"' },
      body: { ...updateBody, categories: [] },
    },
  );
  assertError(invalidUpdate, 400, "SUPPLIER_VALIDATION_FAILED");
  assert.equal(typeof invalidUpdate.body.fieldErrors.categories, "string");
  await assertSupplierUnchanged(createdId, adminToken, createdSnapshot, '"v0"');

  const concurrentUpdates = await Promise.all([
    supplierRequest(`/api/v1/suppliers/${createdId}`, adminToken, {
      method: "PUT",
      headers: { "If-Match": '"v0"' },
      body: updateBody,
    }),
    supplierRequest(`/api/v1/suppliers/${createdId}`, secondAdminToken, {
      method: "PUT",
      headers: { "If-Match": '"v0"' },
      body: updateBody,
    }),
  ]);
  assert.deepEqual(
    concurrentUpdates.map(({ response }) => response.status).sort(),
    [200, 412],
  );
  const update = concurrentUpdates.find(
    ({ response }) => response.status === 200,
  );
  const staleConcurrentUpdate = concurrentUpdates.find(
    ({ response }) => response.status === 412,
  );
  assertError(staleConcurrentUpdate, 412, "SUPPLIER_VERSION_CONFLICT");
  assert.equal(update.response.status, 200, JSON.stringify(update.body));
  assert.equal(update.response.headers.get("etag"), '"v1"');
  assert.equal(update.body.id, createdId);
  assert.equal(update.body.createdAt, created.body.createdAt);
  assertLater(update.body.updatedAt, created.body.updatedAt);
  assert.equal(update.body.status, "ACTIVE");
  assert.equal(update.body.version, 1);
  assert.deepEqual(editableBody(update.body), expectedEditableBody(updateBody));
  const updatedSnapshot = supplierSnapshot(createdId);
  assertSnapshotMatchesResponse(updatedSnapshot, update.body);

  await assertSupplierUnchanged(createdId, adminToken, updatedSnapshot, '"v1"');

  return { updatedSnapshot };
}

async function verifyRejectedLifecyclePreconditions({
  path,
  method,
  token,
  supplierId,
  expectedSnapshot,
  expectedEtag,
  staleEtag,
}) {
  const cases = [
    { expectedStatus: 428, expectedCode: "SUPPLIER_PRECONDITION_REQUIRED" },
    {
      etag: `W/${expectedEtag}`,
      expectedStatus: 400,
      expectedCode: "SUPPLIER_VALIDATION_FAILED",
    },
    {
      etag: staleEtag,
      expectedStatus: 412,
      expectedCode: "SUPPLIER_VERSION_CONFLICT",
    },
    {
      etag: hugeEtag,
      expectedStatus: 412,
      expectedCode: "SUPPLIER_VERSION_CONFLICT",
    },
  ];

  for (const { etag, expectedStatus, expectedCode } of cases) {
    const headers = etag === undefined ? {} : { "If-Match": etag };
    const rejected = await supplierRequest(path, token, { method, headers });
    assertError(rejected, expectedStatus, expectedCode);
    await assertSupplierUnchanged(
      supplierId,
      token,
      expectedSnapshot,
      expectedEtag,
    );
  }
}

async function verifyArchiveScenarios({
  memberToken,
  adminToken,
  createdId,
  updatedSnapshot,
}) {
  await verifyRejectedLifecyclePreconditions({
    path: `/api/v1/suppliers/${createdId}`,
    method: "DELETE",
    token: adminToken,
    supplierId: createdId,
    expectedSnapshot: updatedSnapshot,
    expectedEtag: '"v1"',
    staleEtag: '"v99"',
  });

  const archive = await supplierRequest(
    `/api/v1/suppliers/${createdId}`,
    adminToken,
    { method: "DELETE", headers: { "If-Match": '"v1"' } },
  );
  assertNoContent(archive);
  const archivedSnapshot = supplierSnapshot(createdId);
  assert.equal(supplierIdCount(createdId), 1);
  assert.equal(archivedSnapshot.status, "ARCHIVED");
  assert.equal(archivedSnapshot.version, 2);
  assert.notEqual(archivedSnapshot.archived_at, null);
  assertLater(archivedSnapshot.updated_at, updatedSnapshot.updated_at);
  assert.deepEqual(
    {
      id: archivedSnapshot.id,
      name: archivedSnapshot.name,
      categories: archivedSnapshot.categories,
      building_code: archivedSnapshot.building_code,
      floor: archivedSnapshot.floor,
      location_description: archivedSnapshot.location_description,
      latitude: archivedSnapshot.latitude,
      longitude: archivedSnapshot.longitude,
      hours_kind: archivedSnapshot.hours_kind,
      opens_at: archivedSnapshot.opens_at,
      closes_at: archivedSnapshot.closes_at,
    },
    {
      id: updatedSnapshot.id,
      name: updatedSnapshot.name,
      categories: updatedSnapshot.categories,
      building_code: updatedSnapshot.building_code,
      floor: updatedSnapshot.floor,
      location_description: updatedSnapshot.location_description,
      latitude: updatedSnapshot.latitude,
      longitude: updatedSnapshot.longitude,
      hours_kind: updatedSnapshot.hours_kind,
      opens_at: updatedSnapshot.opens_at,
      closes_at: updatedSnapshot.closes_at,
    },
  );

  const archivedMemberList = await supplierRequest(
    "/api/v1/suppliers?q=Mutation%20Smoke%20Hub&size=100",
    memberToken,
  );
  assert.equal(archivedMemberList.response.status, 200);
  assert.equal(
    archivedMemberList.body.items.some(({ id }) => id === createdId),
    false,
  );
  const archivedMemberDetail = await supplierRequest(
    `/api/v1/suppliers/${createdId}`,
    memberToken,
  );
  assertError(archivedMemberDetail, 404, "SUPPLIER_NOT_FOUND");
  const forbiddenArchivedList = await supplierRequest(
    "/api/v1/suppliers?status=ARCHIVED",
    memberToken,
  );
  assertError(forbiddenArchivedList, 403, "FORBIDDEN");
  const archivedAdminList = await supplierRequest(
    "/api/v1/suppliers?status=ARCHIVED&q=Mutation%20Smoke%20Hub&size=100",
    adminToken,
  );
  assert.equal(archivedAdminList.response.status, 200);
  assert.ok(archivedAdminList.body.items.some(({ id }) => id === createdId));
  const archivedAdminDetail = await supplierRequest(
    `/api/v1/suppliers/${createdId}`,
    adminToken,
  );
  assert.equal(archivedAdminDetail.response.status, 200);
  assert.equal(archivedAdminDetail.response.headers.get("etag"), '"v2"');
  assertSnapshotMatchesResponse(archivedSnapshot, archivedAdminDetail.body);

  const archivedDuplicate = await supplierRequest(
    "/api/v1/suppliers",
    adminToken,
    {
      method: "POST",
      body: {
        ...updateBody,
        name: " mutation smoke hub ",
        floor: " ",
        locationDescription: "outside com2 level 1",
      },
    },
  );
  assertError(archivedDuplicate, 409, "SUPPLIER_ALREADY_EXISTS");
  assert.equal(archivedDuplicate.body.existingSupplierId, createdId);
  assert.equal(supplierCount(), 22);
  assert.deepEqual(supplierSnapshot(createdId), archivedSnapshot);

  for (const repeatedArchiveHeaders of [
    {},
    { "If-Match": 'W/"v2"' },
    { "If-Match": '"v1"' },
  ]) {
    const repeatedArchive = await supplierRequest(
      `/api/v1/suppliers/${createdId}`,
      adminToken,
      { method: "DELETE", headers: repeatedArchiveHeaders },
    );
    assertNoContent(repeatedArchive);
    assert.deepEqual(supplierSnapshot(createdId), archivedSnapshot);
  }

  const archivedUpdate = await supplierRequest(
    `/api/v1/suppliers/${createdId}`,
    adminToken,
    {
      method: "PUT",
      headers: { "If-Match": '"v2"' },
      body: archivedUpdateBody,
    },
  );
  assert.equal(archivedUpdate.response.status, 200);
  assert.equal(archivedUpdate.response.headers.get("etag"), '"v3"');
  assert.equal(archivedUpdate.body.id, createdId);
  assert.equal(archivedUpdate.body.status, "ARCHIVED");
  assert.equal(archivedUpdate.body.version, 3);
  assert.equal(archivedUpdate.body.archivedAt, archivedAdminDetail.body.archivedAt);
  assertLater(archivedUpdate.body.updatedAt, archivedAdminDetail.body.updatedAt);
  assert.deepEqual(
    editableBody(archivedUpdate.body),
    expectedEditableBody(archivedUpdateBody),
  );
  const archivedUpdatedSnapshot = supplierSnapshot(createdId);
  assert.deepEqual(archivedUpdatedSnapshot.categories, ["SHOPPING"]);
  assertSnapshotMatchesResponse(archivedUpdatedSnapshot, archivedUpdate.body);

  return { archivedUpdate, archivedUpdatedSnapshot };
}

async function verifyRestoreScenarios({
  memberToken,
  adminToken,
  createdId,
  archivedUpdate,
  archivedUpdatedSnapshot,
}) {
  await verifyRejectedLifecyclePreconditions({
    path: `/api/v1/suppliers/${createdId}/restore`,
    method: "POST",
    token: adminToken,
    supplierId: createdId,
    expectedSnapshot: archivedUpdatedSnapshot,
    expectedEtag: '"v3"',
    staleEtag: '"v2"',
  });

  const restore = await supplierRequest(
    `/api/v1/suppliers/${createdId}/restore`,
    adminToken,
    { method: "POST", headers: { "If-Match": '"v3"' } },
  );
  assert.equal(restore.response.status, 200);
  assert.equal(restore.response.headers.get("etag"), '"v4"');
  assert.equal(restore.body.id, createdId);
  assert.equal(restore.body.status, "ACTIVE");
  assert.equal(restore.body.version, 4);
  assert.equal(restore.body.archivedAt, null);
  assertLater(restore.body.updatedAt, archivedUpdate.body.updatedAt);
  assert.deepEqual(
    editableBody(restore.body),
    expectedEditableBody(archivedUpdateBody),
  );
  const restoredSnapshot = supplierSnapshot(createdId);
  assertSnapshotMatchesResponse(restoredSnapshot, restore.body);

  const restoredMemberList = await supplierRequest(
    "/api/v1/suppliers?q=Mutation%20Smoke%20Hub%20Archived&size=100",
    memberToken,
  );
  assert.equal(restoredMemberList.response.status, 200);
  assert.ok(restoredMemberList.body.items.some(({ id }) => id === createdId));
  const restoredMemberDetail = await supplierRequest(
    `/api/v1/suppliers/${createdId}`,
    memberToken,
  );
  assert.equal(restoredMemberDetail.response.status, 200);
  assert.equal(restoredMemberDetail.response.headers.get("etag"), '"v4"');

  const repeatedRestore = await supplierRequest(
    `/api/v1/suppliers/${createdId}/restore`,
    adminToken,
    { method: "POST", headers: { "If-Match": '"v4"' } },
  );
  assert.equal(repeatedRestore.response.status, 200);
  assert.equal(repeatedRestore.response.headers.get("etag"), '"v4"');
  assert.deepEqual(repeatedRestore.body, restore.body);
  assert.deepEqual(supplierSnapshot(createdId), restoredSnapshot);

  const staleRepeatedRestore = await supplierRequest(
    `/api/v1/suppliers/${createdId}/restore`,
    adminToken,
    { method: "POST", headers: { "If-Match": '"v3"' } },
  );
  assertError(staleRepeatedRestore, 412, "SUPPLIER_VERSION_CONFLICT");
  assert.deepEqual(supplierSnapshot(createdId), restoredSnapshot);

  return restoredSnapshot;
}

async function verifyRepeatabilityAndOutageScenarios({
  memberToken,
  adminToken,
  createdId,
  restoredSnapshot,
  initialPrinterBody,
}) {
  const printerUpdateBody = {
    ...initialPrinterBody,
    name: "Printer @ COM2 Smoke Edited",
    categories: ["PRINTING", "PICKUP_POINT"],
    locationDescription: "Smoke retained next to LT19",
  };
  const printerUpdate = await supplierRequest(
    `/api/v1/suppliers/${printerId}`,
    adminToken,
    {
      method: "PUT",
      headers: { "If-Match": '"v0"' },
      body: printerUpdateBody,
    },
  );
  assert.equal(printerUpdate.response.status, 200);
  assert.equal(printerUpdate.response.headers.get("etag"), '"v1"');
  assert.equal(printerUpdate.body.id, printerId);
  assert.equal(printerUpdate.body.version, 1);
  assert.deepEqual(
    editableBody(printerUpdate.body),
    expectedEditableBody(printerUpdateBody),
  );
  const editedPrinterSnapshot = supplierSnapshot(printerId);
  assertSnapshotMatchesResponse(editedPrinterSnapshot, printerUpdate.body);

  const repeatMigration = compose(
    ["run", "--rm", "--no-deps", "supplier-migrate"],
    { capture: true },
  );
  assert.match(repeatMigration, /Supplier database migrations completed\./);
  assert.equal(supplierCount(), 22);
  assert.deepEqual(supplierSnapshot(printerId), editedPrinterSnapshot);
  assert.deepEqual(supplierSnapshot(createdId), restoredSnapshot);

  const repeatSeed = compose(
    [
      "run",
      "--rm",
      "--no-deps",
      "supplier-service",
      "node",
      "dist/database/seed/run.js",
    ],
    { capture: true },
  );
  assert.match(
    repeatSeed,
    /Supplier seed completed: 0 inserted, 21 already present\./,
  );
  assert.equal(supplierCount(), 22);
  assert.equal(supplierIdCount(printerId), 1);
  assert.equal(supplierIdCount(createdId), 1);
  assert.deepEqual(supplierSnapshot(printerId), editedPrinterSnapshot);
  assert.deepEqual(supplierSnapshot(createdId), restoredSnapshot);

  compose(["stop", "user-service"]);
  const preOutageCount = supplierCount();
  const outageMutation = await supplierRequest(
    "/api/v1/suppliers",
    adminToken,
    {
      method: "POST",
      body: {
        ...createBody,
        name: "Must Not Be Created During User Outage",
        locationDescription: "Authentication outage mutation probe",
      },
    },
  );
  assertError(outageMutation, 503, "AUTHENTICATION_UNAVAILABLE");
  assert.equal(supplierCount(), preOutageCount);
  assert.deepEqual(supplierSnapshot(printerId), editedPrinterSnapshot);
  assert.deepEqual(supplierSnapshot(createdId), restoredSnapshot);
  const unavailableRead = await supplierRequest(
    "/api/v1/suppliers",
    memberToken,
  );
  assertError(unavailableRead, 503, "AUTHENTICATION_UNAVAILABLE");
  const healthWhileUserDown = await fetch(`${supplierBaseUrl}/health`);
  assert.equal(healthWhileUserDown.status, 200);

  compose(["start", "user-service"]);
  await waitFor(`${userBaseUrl}/health`, "restarted User health");
  const recovered = await supplierRequest("/api/v1/suppliers", memberToken);
  assert.equal(recovered.response.status, 200);
}

async function run() {
  const context = await prepareSmokeContext();
  const initialPrinterBody = await verifyCatalogueReadScenarios(context);
  const createdContext = await verifyMutationAccessAndCreateScenarios({
    ...context,
    initialPrinterBody,
  });
  const updatedContext = await verifyUpdateScenarios({
    ...context,
    ...createdContext,
  });
  const archivedContext = await verifyArchiveScenarios({
    ...context,
    ...createdContext,
    ...updatedContext,
  });
  const restoredSnapshot = await verifyRestoreScenarios({
    ...context,
    ...createdContext,
    ...archivedContext,
  });
  await verifyRepeatabilityAndOutageScenarios({
    ...context,
    ...createdContext,
    restoredSnapshot,
    initialPrinterBody,
  });

  console.info(
    "PASS: real auth, mutation authorization, validation/preconditions, " +
      "concurrent and ACTIVE/ARCHIVED duplicate creation rejection, create/update, " +
      "archive/restore lifecycle no-ops, SQL retention, repeat-migration/seed " +
      "preservation, metadata/catalogue reads, OpenAPI docs, logging, assets, " +
      "and fail-closed auth.",
  );
}

try {
  await run();
} catch (error) {
  if (stackStarted) {
    console.error(compose(["logs", "--no-color", "supplier-service"], {
      capture: true,
    }));
  }
  throw error;
} finally {
  if (stackStarted) {
    console.info("Removing the dedicated Supplier smoke stack and volumes...");
  }
  resetStack();
  assert.equal(compose(["ps", "--quiet"], { capture: true }).trim(), "");
}
