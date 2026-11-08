// Backend load. Hits Order directly with the gateway identity headers.
// Order then calls User, Supplier, Credit, and, on escalate, Admin.
//
//   k6 run load-test/k6/load.js
//   k6 run -e VUS=30 -e DURATION=30s load-test/k6/load.js
//
// VUS must match setup/seed-users.mjs. Every seeded user can request and deliver;
// each iteration picks a role with REQUEST_PROBABILITY (default 0.3).
// Lunch creates are gated separately so dual-role does not 3× write volume vs the
// old fixed requester roster (~REQUEST_PROBABILITY × VUS × MAX_ORDERS).
//
// Metrics cardinality (Prometheus / Grafana Cloud):
// Paths like /orders/${id}/accept would otherwise make one series per order via the
// default `url` (and default `name`=URL) tags. Fix: set tags.name to a stable endpoint
// id (k6 then also sets `url` to it); `url` is left out of systemTags as well.

import encoding from "k6/encoding";
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";

const total = intEnv("VUS", 9600);
// Chance this iteration acts as requester (else courier). Matches product: anyone can do both.
const requestProbability = Number(__ENV.REQUEST_PROBABILITY || __ENV.REQUESTER_SHARE || 0.3);
// On a deliver iteration, P(browse pool + maybe accept). Real couriers do not
// refresh/accept every second; 1.0 caused empty-pool read storms.
const courierBrowseProbability = Number(__ENV.COURIER_BROWSE_PROBABILITY || 0.2);
const orderUrl = __ENV.ORDER_URL || "http://localhost:8083";
const pickupId = __ENV.PICKUP_ID || "2";
const dropoffId = Number(__ENV.DROPOFF_ID || 1);
const escalateEvery = intEnv("ESCALATE_EVERY", 20);
const think = Number(__ENV.THINK_SECONDS || 1);
// Lunch-peak shape: ~requestProbability of VUs place this many orders for the run.
// 9600 VUs is already ~2× expected peak headcount.
const maxOrdersPerRequester = intEnv("MAX_ORDERS_PER_REQUESTER", 2);

// One user per element: SharedArray re-parses an element on every access, so a
// single element holding every user would parse the whole file each iteration.
const users = new SharedArray("users", () => {
  const data = JSON.parse(open("../data/users.json"));
  if (Array.isArray(data.users) && data.users.length > 0) {
    return data.users;
  }
  return [...data.requesters, ...data.couriers];
});

const photo = encoding.b64decode(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
);

if (users.length < total) {
  throw new Error("users.json is smaller than this VUS. Re-run setup/seed-users.mjs with the same VUS.");
}
if (!(requestProbability > 0) || !(requestProbability < 1)) {
  throw new Error("REQUEST_PROBABILITY must be between 0 and 1");
}
if (!(courierBrowseProbability > 0) || courierBrowseProbability > 1) {
  throw new Error("COURIER_BROWSE_PROBABILITY must be in (0, 1]");
}

// Per-VU state (each VU has its own JS runtime).
const openOrders = [];
let createdCount = 0;
let createAttempts = 0;
// Once per VU: keep lunch create volume ≈ share × VUS × maxOrders (not every VU × maxOrders).
const lunchCreateBudget = Math.random() < requestProbability ? maxOrdersPerRequester : 0;
// Small retry allowance only — unlimited retries on failure starve Order (create death spiral).
const maxCreateAttempts = lunchCreateBudget > 0 ? lunchCreateBudget + 3 : 0;

export const options = {
  // systemTags only lists built-in tags. Custom `op` still comes from request tags.
  // Must not include `url` — that label keeps the full path with order UUIDs.
  systemTags: ["status", "method", "name", "expected_response", "scenario", "group", "check"],
  scenarios: {
    traffic: {
      executor: "constant-vus",
      vus: total,
      duration: __ENV.DURATION || "10m",
      exec: "traffic",
    },
  },
  thresholds: {
    "http_req_failed{op:create}": ["rate<0.05"],
    "http_req_failed{op:read}": ["rate<0.05"],
    "http_req_failed{op:fulfill}": ["rate<0.05"],
    "http_req_failed{op:close}": ["rate<0.05"],
  },
};

export function traffic() {
  const userId = users[(__VU - 1) % users.length].id;
  // Always advance own open orders so courier iterations do not strand them.
  pollAndCloseOwn(userId);
  if (Math.random() < requestProbability) {
    maybeCreate(userId);
    requesterReads(userId);
  } else {
    courier(userId);
  }
  sleep(think);
}

function maybeCreate(userId) {
  if (lunchCreateBudget === 0) {
    return;
  }
  if (createdCount >= lunchCreateBudget || createAttempts >= maxCreateAttempts) {
    return;
  }
  if (openOrders.length >= lunchCreateBudget) {
    return;
  }
  createAttempts += 1;
  const created = createOrder(userId);
  if (created) {
    openOrders.push(created);
    createdCount += 1;
  }
}

function pollAndCloseOwn(userId) {
  for (let index = openOrders.length - 1; index >= 0; index -= 1) {
    const status = orderStatus(userId, openOrders[index]);
    if (status === "DELIVERED") {
      closeOrder(userId, openOrders[index]);
      openOrders.splice(index, 1);
    } else if (
      status === "ACKNOWLEDGED" ||
      status === "ESCALATED" ||
      status === "UNDER_REVIEW" ||
      status === "COMPLETED" ||
      status === "CANCELLED" ||
      status === "EXPIRED"
    ) {
      openOrders.splice(index, 1);
    }
  }
}

function requesterReads(userId) {
  if (__ITER % 5 === 0) {
    readJson(userId, `${orderUrl}/api/v1/orders/requests/active?page=0&size=20`, "requests_active");
    readJson(userId, `${orderUrl}/api/v1/orders/alerts?page=0&size=20`, "alerts");
  }
  if (__ITER % 10 === 0) {
    readJson(userId, `${orderUrl}/api/v1/orders/mine?page=0&size=20`, "mine");
    readJson(userId, `${orderUrl}/api/v1/orders/requests/past?page=0&size=20`, "requests_past");
  }
}

function courier(userId) {
  // Most deliver iterations are idle think-time; only a share browses the pool.
  if (Math.random() < courierBrowseProbability) {
    const pool = readJson(userId, `${orderUrl}/api/v1/orders?page=0&size=20`, "pool");
    const content = pool && pool.content ? pool.content : [];
    // Never accept our own request — Order returns 409 and that is a real reject.
    // Race "already taken" 409 from another courier is expected and counts as OK.
    const candidates = content.filter(
      (order) =>
        order &&
        order.id &&
        String(order.requesterId || "").toLowerCase() !== String(userId).toLowerCase() &&
        !openOrders.includes(order.id),
    );
    if (candidates.length > 0) {
      const order = candidates[Math.floor(Math.random() * candidates.length)];
      const accepted = http.post(
        `${orderUrl}/api/v1/orders/${order.id}/accept`,
        null,
        // 409 = already claimed (expected contention), not a threshold failure.
        params(userId, "fulfill", "accept", [200, 409]),
      );
      check(accepted, {
        "accept claimed or already taken": (response) => response.status === 200 || response.status === 409,
      });
      if (accepted.status === 200) {
        upload(userId, order.id, "collect");
        upload(userId, order.id, "deliver");
      }
    }
  }
  // Occasional courier list/search — not every browse, not every idle tick.
  if (__ITER % 10 === 0) {
    readJson(userId, `${orderUrl}/api/v1/orders/deliveries/active?page=0&size=20`, "deliveries_active");
    readJson(userId, `${orderUrl}/api/v1/orders/deliveries/past?page=0&size=20`, "deliveries_past");
    readJson(
      userId,
      `${orderUrl}/api/v1/orders/search?pickupLocationId=${pickupId}&page=0&size=20`,
      "search",
    );
  }
}

function createOrder(userId) {
  const now = Date.now();
  const response = http.post(
    `${orderUrl}/api/v1/orders`,
    JSON.stringify({
      itemDescription: "Load test drop",
      credits: 1,
      expiryTime: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
      deliveryTime: new Date(now + 5 * 60 * 60 * 1000).toISOString(),
      fromLocation: pickupId,
      deliveryPointId: dropoffId,
    }),
    params(userId, "create", "create", [201]),
  );
  const ok = check(response, { "order created": (body) => body.status === 201 });
  if (!ok) {
    return null;
  }
  return response.json("id");
}

function closeOrder(userId, orderId) {
  if (__ITER % escalateEvery === 0) {
    const response = http.post(
      `${orderUrl}/api/v1/orders/${orderId}/escalate`,
      JSON.stringify({ disputeText: "Load test dispute" }),
      params(userId, "close", "escalate", [200, 409]),
    );
    check(response, { "escalated or already closed": (body) => body.status === 200 || body.status === 409 });
    return;
  }
  const response = http.post(
    `${orderUrl}/api/v1/orders/${orderId}/acknowledge`,
    null,
    params(userId, "close", "acknowledge", [200, 409]),
  );
  check(response, { "acknowledged or already closed": (body) => body.status === 200 || body.status === 409 });
}

function upload(userId, orderId, action) {
  const response = http.post(
    `${orderUrl}/api/v1/orders/${orderId}/${action}`,
    { photo: http.file(photo, `${action}.png`, "image/png") },
    {
      headers: { "X-User-Id": userId, "X-Permitted-Action": "true" },
      tags: { op: "fulfill", name: action },
      timeout: "30s",
      responseCallback: http.expectedStatuses(200),
    },
  );
  check(response, { [`${action} stored a photo`]: (body) => body.status === 200 });
}

function orderStatus(userId, orderId) {
  const body = readJson(userId, `${orderUrl}/api/v1/orders/${orderId}`, "get_order");
  return body && body.status ? body.status : "";
}

function readJson(userId, url, name) {
  const response = http.get(url, params(userId, "read", name, [200]));
  check(response, { "read ok": (body) => body.status === 200 });
  if (response.status !== 200) {
    return null;
  }
  return response.json();
}

function params(userId, op, name, statuses) {
  return {
    headers: {
      "X-User-Id": userId,
      "X-Permitted-Action": "true",
      "Content-Type": "application/json",
    },
    tags: { op, name },
    timeout: "30s",
    responseCallback: http.expectedStatuses(...statuses),
  };
}

function intEnv(name, fallback) {
  const parsed = Number(__ENV[name] || fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}
