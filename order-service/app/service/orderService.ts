import { randomUUID } from "node:crypto";
import { Op, type Transaction, type WhereOptions } from "sequelize";
import type { AuthenticatedUser } from "../middleware/auth.ts";
import { Order, sequelize } from "../models/index.ts";
import type { OrderInstance } from "../models/orderModel.ts";
import {
  EVENT_TYPES,
  ORDER_STATUSES,
  type NewOrderFields,
  type OrderAttributes,
  type OrderEventType,
  type OrderStatus,
} from "../models/types.ts";
import * as creditClient from "../clients/creditClient.ts";
import * as outboxRelay from "../events/outboxRelay.ts";
import { recordOrderEvent } from "../events/orderEvents.ts";
import { badRequest, conflict, forbidden, notFound } from "../utils/httpError.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isAdmin = (user: AuthenticatedUser): boolean => user.roles.includes("ADMIN");

// validation
const isNonEmptyString = (v: unknown, max = 255): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;

function parseCreateBody(raw: unknown): NewOrderFields {
  const b = (raw ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!isNonEmptyString(b.title)) errors.push("title is required (max 255 characters)");
  if (b.description !== undefined && (typeof b.description !== "string" || b.description.length > 255)) {
    errors.push("description must be a string (max 255 characters)");
  }
  if (!isNonEmptyString(b.supplier_id)) errors.push("supplier_id is required");
  if (!isNonEmptyString(b.delivery_location)) errors.push("delivery_location is required (max 255 characters)");
  if (typeof b.credit_amount !== "number" || !Number.isInteger(b.credit_amount) || b.credit_amount < 1) {
    errors.push("credit_amount must be a positive integer");
  }

  const accept_by = new Date(typeof b.accept_by === "string" ? b.accept_by : NaN);
  if (typeof b.accept_by !== "string" || Number.isNaN(accept_by.getTime())) {
    errors.push("accept_by must be an ISO 8601 date-time string");
  } else if (accept_by <= new Date()) {
    errors.push("accept_by must be in the future");
  }

  if (errors.length > 0) throw badRequest("Validation failed", errors);

  return {
    title: (b.title as string).trim(),
    description: (b.description as string | undefined) ?? "",
    supplier_id: (b.supplier_id as string).trim(),
    delivery_location: (b.delivery_location as string).trim(),
    credit_amount: b.credit_amount as number,
    accept_by: accept_by,
  };
}

async function findOrderOrThrow(orderId: string): Promise<OrderInstance> {
  if (!UUID_RE.test(orderId)) throw badRequest("Invalid order id");
  const order = await Order.findByPk(orderId);
  if (!order) throw notFound("Order not found");
  return order;
}

// Create order
export async function createOrder(user: AuthenticatedUser, body: unknown): Promise<OrderInstance> {
  const fields = parseCreateBody(body);

  const orderId = randomUUID();

  // reserve the requester's credits
  // Throws 409 (rejected) or 503 (service down).
  await creditClient.reserve({ orderId, userId: user.id, amount: fields.credit_amount });

  try {
    // Order row + ORDER_CREATED outbox event commit together
    const order = await sequelize.transaction(async (t: Transaction) => {
      const created = await Order.create(
        {
          order_id: orderId,
          requester_id: user.id,
          status: "OPEN",
          ...fields,
        },
        { transaction: t }
      );
      await recordOrderEvent(EVENT_TYPES.ORDER_CREATED, created, t);
      return created;
    });
    outboxRelay.kick();
    return order;
  } catch (err) {
    await compensateReservation(orderId, user.id, fields.credit_amount);
    throw err;
  }
}

// ORDER_CANCELLED event makes the credit service release the reservation for this order_id.
async function compensateReservation(orderId: string, userId: string, amount: number): Promise<void> {
  try {
    await sequelize.transaction((t) =>
      recordOrderEvent(
        EVENT_TYPES.ORDER_CANCELLED,
        { order_id: orderId, requester_id: userId, courier_id: null, credit_amount: amount },
        t
      )
    );
    outboxRelay.kick();
  } catch (err) {
    console.error(
      `RESERVATION LEAK: credits reserved but order not saved and release not recorded. order_id=${orderId} user_id=${userId} amount=${amount}: ${(err as Error).message}`
    );
  }
}


// Get order by id

export async function getOrder(user: AuthenticatedUser, orderId: string): Promise<OrderInstance> {
  const order = await findOrderOrThrow(orderId);

  // OPEN orders are visible to everyone
  // others are only visible to admins and associated requester/courier
  const involved = order.requester_id === user.id || order.courier_id === user.id;
  if (order.status !== "OPEN" && !involved && !isAdmin(user)) {
    throw forbidden("You do not have access to this order");
  }
  return order;
}

// Parsing parameter
const asString = (name: string, v: unknown): string | undefined => {
  if (v !== undefined && typeof v !== "string") throw badRequest(`${name} must be a single value`);
  return v;
};

const asInt = (
  name: string,
  v: unknown,
  { min, max, fallback }: { min: number; max: number; fallback: number }
): number => {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw badRequest(`${name} must be an integer between ${min} and ${max}`);
  }
  return n;
};

export interface OrderPage {
  data: OrderInstance[];
  total: number;
  limit: number;
  offset: number;
}

// GET /api/orders?status=&requester_id=&courier_id=&limit=&offset=
export async function listOrders(
  user: AuthenticatedUser,
  query: Record<string, unknown>
): Promise<OrderPage> {
  const status = asString("status", query.status);
  const requesterId = asString("requester_id", query.requester_id);
  const courierId = asString("courier_id", query.courier_id);
  const limit = asInt("limit", query.limit, { min: 1, max: 100, fallback: 50 });
  const offset = asInt("offset", query.offset, { min: 0, max: 1e9, fallback: 0 });

  if (status !== undefined && !(ORDER_STATUSES as readonly string[]).includes(status)) {
    throw badRequest(`status must be one of: ${ORDER_STATUSES.join(", ")}`);
  }

  const where: WhereOptions<OrderAttributes> & Record<string, unknown> = {};
  const scoped = requesterId !== undefined || courierId !== undefined;


  if (requesterId !== undefined) {
    if (requesterId !== user.id && !isAdmin(user)) throw forbidden("You can only list your own orders");
    where.requester_id = requesterId;
  }
  if (courierId !== undefined) {
    if (courierId !== user.id && !isAdmin(user)) throw forbidden("You can only list your own orders");
    where.courier_id = courierId;
  }

  // Without an owner filter this is the public "browse open orders" view
  if (!scoped && !isAdmin(user) && status !== undefined && status !== "OPEN") {
    throw forbidden("Listing non-open orders requires a requester_id or courier_id filter");
  }
  const effectiveStatus = (status as OrderStatus | undefined) ?? (scoped ? undefined : "OPEN");
  if (effectiveStatus) where.status = effectiveStatus;
 
  // Browsing OPEN orders: hide ones whose accept-by time has passed.
  // The expiry worker marks those rows EXPIRED and publishes ORDER_EXPIRED.
  if (effectiveStatus === "OPEN" && requesterId === undefined) {
    where.accept_by = { [Op.gt]: new Date() };
  }
 
  const { rows, count } = await Order.findAndCountAll({
    where,
    order: [["created_at", "DESC"]],
    limit,
    offset,
  });

  return { data: rows, total: count, limit, offset };
}

// Status transitions

type StampField = "accepted_at" | "picked_up_at" | "completed_at" | "cancelled_at";

interface TransitionOptions {
  /** statuses the order must currently be in */
  allowedFrom: OrderStatus[];
  /** new status */
  to: OrderStatus;
  /** timestamp column*/
  stampField: StampField;
  /** throws 403 (or 409) if this user may not perform the action */
  authorize: (order: OrderInstance, user: AuthenticatedUser) => void;
  /** extra column values (e.g. courier_id) */
  set?: Partial<OrderAttributes>;
  /** extra guard conditions, evaluated at call time */
  extraWhere?: () => Record<string, unknown>;
  /** outbox event to record in the same transaction */
  eventType?: OrderEventType;
}
 
async function transition(
  user: AuthenticatedUser,
  orderId: string,
  opts: TransitionOptions
): Promise<OrderInstance> {
  const { allowedFrom, to, stampField, authorize, set = {}, extraWhere, eventType } = opts;

  const order = await findOrderOrThrow(orderId);
  authorize(order, user);

  if (!allowedFrom.includes(order.status)) {
    throw conflict(`Order is ${order.status}; expected ${allowedFrom.join(" or ")}`, "INVALID_STATE");
  }

  const now = new Date();
  const updated = await sequelize.transaction(async (t: Transaction) => {
    // The WHERE clause re-checks the state, so a concurrent change loses cleanly
    const [count, rows] = await Order.update(
      { status: to, [stampField]: now, ...set },
      {
        where: {
          order_id: orderId,
          status: { [Op.in]: allowedFrom },
          ...(extraWhere?.() ?? {}),
        },
        returning: true,
        transaction: t,
      }
    );
    const row = rows[0];
    if (count === 0 || !row) {
      throw conflict("Order was changed by someone else, please refresh", "INVALID_STATE");
    }
    if (eventType) await recordOrderEvent(eventType, row, t);
    return row;
  });

  if (eventType) outboxRelay.kick();
  return updated;
}

const requireRequester = (order: OrderInstance, user: AuthenticatedUser): void => {
  if (order.requester_id !== user.id) throw forbidden("Only the requester can do this");
};

export const accept = (user: AuthenticatedUser, orderId: string) =>
  transition(user, orderId, {
    allowedFrom: ["OPEN"],
    to: "ACCEPTED",
    stampField: "accepted_at",
    set: { courier_id: user.id },
    eventType: EVENT_TYPES.ORDER_ACCEPTED, // notification service
    // Can't be accepted once its accept-by time has passed
    extraWhere: () => ({ accept_by: { [Op.gt]: new Date() } }),
    authorize: (order, u) => {
      if (order.requester_id === u.id) throw forbidden("You cannot accept your own order");
      if (order.accept_by <= new Date()) {
        throw conflict("This order is past its accept-by time", "ORDER_EXPIRED");
      }
    },
  });

export const pickup = (user: AuthenticatedUser, orderId: string) =>
  transition(user, orderId, {
    allowedFrom: ["ACCEPTED"],
    to: "PICKED_UP",
    stampField: "picked_up_at",
    eventType: EVENT_TYPES.ORDER_PICKED_UP, // notification service
    authorize: (order, u) => {
      if (order.courier_id !== u.id) throw forbidden("Only the assigned courier can do this");
    },
  });

export const complete = (user: AuthenticatedUser, orderId: string) =>
  transition(user, orderId, {
    allowedFrom: ["PICKED_UP"],
    to: "COMPLETED",
    stampField: "completed_at",
    authorize: requireRequester,
    eventType: EVENT_TYPES.ORDER_COMPLETED, // credit service: transfer requester -> courier
  });

// Cancellable until the courier has picked the item up
export const cancel = (user: AuthenticatedUser, orderId: string) =>
  transition(user, orderId, {
    allowedFrom: ["OPEN", "ACCEPTED"],
    to: "CANCELLED",
    stampField: "cancelled_at",
    authorize: requireRequester,
    eventType: EVENT_TYPES.ORDER_CANCELLED, // credit service: release the reservation
  });

const EXPIRY_BATCH_SIZE = 50;

/**
 * Moves due OPEN orders to EXPIRED and writes one outbox event per row that changed.
 * The status check is in the UPDATE, so an accept that commits first keeps the order.
 * skipLocked lets a concurrent accept or another scan wait its turn without double expiry.
 */
export async function expireDueOpenOrders(limit = EXPIRY_BATCH_SIZE): Promise<number> {
  const now = new Date();
  let expired = 0;

  await sequelize.transaction(async (t: Transaction) => {
    const due = await Order.findAll({
      where: {
        status: "OPEN",
        accept_by: { [Op.lte]: now },
      },
      order: [["accept_by", "ASC"]],
      limit,
      lock: t.LOCK.UPDATE,
      skipLocked: true,
      transaction: t,
    });

    for (const order of due) {
      const [count, rows] = await Order.update(
        { status: "EXPIRED", expired_at: now },
        {
          where: { order_id: order.order_id, status: "OPEN" },
          returning: true,
          transaction: t,
        }
      );
      const row = rows[0];
      if (count !== 1 || !row) continue;
      await recordOrderEvent(EVENT_TYPES.ORDER_EXPIRED, row, t);
      expired += 1;
    }
  });

  return expired;
}

