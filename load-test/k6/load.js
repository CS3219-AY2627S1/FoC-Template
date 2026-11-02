// Backend load. Hits Order directly with the gateway identity headers.
// Order then calls User, Supplier, Credit, and, on escalate, Admin.
//
//   k6 run load-test/k6/load.js
//   k6 run -e VUS=30 -e DURATION=30s load-test/k6/load.js
//
// VUS and REQUESTER_SHARE must match setup/seed-users.mjs.

import encoding from "k6/encoding";
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";

const total = intEnv("VUS", 9600);
const share = Number(__ENV.REQUESTER_SHARE || 0.3);
const requesterVus = Math.round(total * share);
const courierVus = total - requesterVus;
const orderUrl = __ENV.ORDER_URL || "http://localhost:8083";
const pickupId = __ENV.PICKUP_ID || "2";
const dropoffId = __ENV.DROPOFF_ID || "4";
const escalateEvery = intEnv("ESCALATE_EVERY", 20);
const think = Number(__ENV.THINK_SECONDS || 1);

const seeded = new SharedArray("users", () => {
  const data = JSON.parse(open("../data/users.json"));
  return [{ requesters: data.requesters, couriers: data.couriers }];
});

const photo = encoding.b64decode(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
);

if (seeded[0].requesters.length < requesterVus || seeded[0].couriers.length < courierVus) {
  throw new Error("users.json is smaller than this VUS. Re-run setup/seed-users.mjs with the same VUS.");
}

const openOrders = [];

export const options = {
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
  if (__VU <= requesterVus) {
    requester(seeded[0].requesters[(__VU - 1) % seeded[0].requesters.length].id);
  } else {
    const index = __VU - requesterVus - 1;
    courier(seeded[0].couriers[index % seeded[0].couriers.length].id);
  }
  sleep(think);
}

function requester(userId) {
  if (openOrders.length < 3) {
    const created = createOrder(userId);
    if (created) {
      openOrders.push(created);
    }
  }
  for (let index = openOrders.length - 1; index >= 0; index -= 1) {
    const status = orderStatus(userId, openOrders[index]);
    if (status === "DELIVERED") {
      closeOrder(userId, openOrders[index]);
      openOrders.splice(index, 1);
    } else if (status === "ACKNOWLEDGED" || status === "ESCALATED" || status === "UNDER_REVIEW" || status === "COMPLETED" || status === "CANCELLED" || status === "EXPIRED") {
      openOrders.splice(index, 1);
    }
  }
  if (__ITER % 5 === 0) {
    readJson(userId, `${orderUrl}/api/v1/orders/requests/active?page=0&size=20`);
    readJson(userId, `${orderUrl}/api/v1/orders/alerts?page=0&size=20`);
  }
  if (__ITER % 10 === 0) {
    readJson(userId, `${orderUrl}/api/v1/orders/mine?page=0&size=20`);
    readJson(userId, `${orderUrl}/api/v1/orders/requests/past?page=0&size=20`);
  }
}

function courier(userId) {
  const pool = readJson(userId, `${orderUrl}/api/v1/orders?page=0&size=20`);
  const content = pool && pool.content ? pool.content : [];
  if (content.length > 0) {
    const order = content[Math.floor(Math.random() * content.length)];
    const accepted = http.post(`${orderUrl}/api/v1/orders/${order.id}/accept`, null, params(userId, "fulfill", [200, 409]));
    check(accepted, { "accept claimed or already taken": (response) => response.status === 200 || response.status === 409 });
    if (accepted.status === 200) {
      upload(userId, order.id, "collect");
      upload(userId, order.id, "deliver");
    }
  }
  if (__ITER % 5 === 0) {
    readJson(userId, `${orderUrl}/api/v1/orders/deliveries/active?page=0&size=20`);
    readJson(userId, `${orderUrl}/api/v1/orders/deliveries/past?page=0&size=20`);
    readJson(userId, `${orderUrl}/api/v1/orders/search?pickupLocationId=${pickupId}&page=0&size=20`);
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
      toLocation: dropoffId,
    }),
    params(userId, "create", [201]),
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
      params(userId, "close", [200, 409]),
    );
    check(response, { "escalated or already closed": (body) => body.status === 200 || body.status === 409 });
    return;
  }
  const response = http.post(
    `${orderUrl}/api/v1/orders/${orderId}/acknowledge`,
    null,
    params(userId, "close", [200, 409]),
  );
  check(response, { "acknowledged or already closed": (body) => body.status === 200 || body.status === 409 });
}

function upload(userId, orderId, action) {
  const response = http.post(
    `${orderUrl}/api/v1/orders/${orderId}/${action}`,
    { photo: http.file(photo, `${action}.png`, "image/png") },
    {
      headers: { "X-User-Id": userId, "X-Permitted-Action": "true" },
      tags: { op: "fulfill" },
      timeout: "30s",
      responseCallback: http.expectedStatuses(200),
    },
  );
  check(response, { [`${action} stored a photo`]: (body) => body.status === 200 });
}

function orderStatus(userId, orderId) {
  const body = readJson(userId, `${orderUrl}/api/v1/orders/${orderId}`);
  return body && body.status ? body.status : "";
}

function readJson(userId, url) {
  const response = http.get(url, params(userId, "read", [200]));
  check(response, { "read ok": (body) => body.status === 200 });
  if (response.status !== 200) {
    return null;
  }
  return response.json();
}

function params(userId, op, statuses) {
  return {
    headers: {
      "X-User-Id": userId,
      "X-Permitted-Action": "true",
      "Content-Type": "application/json",
    },
    tags: { op },
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
