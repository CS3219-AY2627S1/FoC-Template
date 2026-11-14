/*
 * AI Assistance Disclosure:
 * Tool: GitHub Copilot (model: GPT-5.6 Luna), date: 2026-09-29
 * Scope: Added the early return after invalid status-filter responses.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-10-12): Mapped edit-order error codes to user-facing messages.
 * Author review: tng wen xi
 * Scope (2026-10-12): Mapped optimistic-lock edit conflicts to HTTP 409.
 * Author review: tng wen xi
 * Scope (2026-10-13): Passed the credit client through status transitions so
 *        requester cancellation releases the persisted reservation.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope (2026-10-20): Issue #5 - ORDER_EXPIRED maps to 409 (George: self-accept 403,
 *        every other accept rejection 409).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Issue #4 - POST /orders answers 202 with the `pending` order (George,
 *        2026-10-20); credit calls moved to the worker, so no credit client here.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Issue #11 - GET /orders delegates to the listing service: 200
 *        { ok, orders, nextCursor }; 400 { message } for unknown or invalid query
 *        parameters (previously an invalid status answered 500).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Issue #6 - writes publish order events; GET /orders/active lists
 *        the caller's active deliveries (F12.1.3), with the same req.user check as the
 *        other handlers.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Frontend integration - GET /orders/mine?as=requester|courier.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): F18.1.1 - ORDER_NOT_EDITABLE maps to 409, like the
 *        other state conflicts.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-22
 * Scope (2026-10-22): ORDER_NOT_FOUND maps to 404 in statusFor (George).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-10-22): GET /orders/:id - 200 with the order, 404 when it is missing or
 *        the caller may not read it (George's spec: requester / courier / admin always,
 *        anyone else only while open).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-10-22): GET /orders passes the caller's id to the listing (non-open statuses
 *        are scoped to the caller's own orders) and answers 401 without one, like the
 *        other handlers.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Codex (model: GPT-6), date: 2026-11-05
 * Scope: Implemented the team-specified admin user order listing contract from chat.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-23
 * Scope (2026-10-23): create / edit pass supplier-service and the caller's Authorization
 *        header to the existence check; SUPPLIER_SERVICE_UNAVAILABLE -> 503,
 *        SUPPLIER_NOT_FOUND / DELIVERY_LOCATION_NOT_FOUND -> 422 (George, 2026-10-23).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented team-specified status notifications and username fallback.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-09
 * Scope (2026-11-09): POST /orders answers 201 with the open order; ORDER_PENDING_EXISTS -> 409,
 *        CREDIT_RESERVE_REJECTED -> 422 (George, 2026-11-09).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */

import type { RequestHandler } from 'express';
import type { PrismaClient } from '../db/prisma.js';
import { ErrorCode, ErrorMessage } from '../constants/errors.js';
import * as ordersService from '../services/orders.service.js';
import { isUuid } from '../utils/validation.js';
import {
  ADMIN_USER_ORDERS_PAGE_SIZE,
  listAdminUserOrders,
  listActiveDeliveries,
  listMyOrders,
  listOrders,
} from '../services/order-listing.service.js';
import type { OrderEventPublisher } from '../realtime/order-events.js';
import type { SuppliersClient } from '../clients/suppliers.client.js';
import type { CreditsClient } from '../clients/credits.client.js';
import { RequestStatus } from '../generated/prisma/enums.js';

/** The caller's own token, forwarded to supplier-service for the existence check. */
const referenceCheck = (
  suppliers: SuppliersClient,
  req: Parameters<RequestHandler>[0],
): ordersService.ReferenceCheck => ({
  suppliers,
  authorization: req.get('authorization') ?? '',
});

export const createOrder =
  (
    prisma: PrismaClient,
    suppliers: SuppliersClient,
    credits: CreditsClient,
    events?: OrderEventPublisher,
  ): RequestHandler =>
  async (req, res) => {
    const requesterId = req.user?.user_id;
    if (!isUuid(requesterId)) {
      res
        .status(401)
        .json({ message: ErrorMessage[ErrorCode.UNAUTHENTICATED] });
      return;
    }

    const result = await ordersService.createOrder(
      prisma,
      requesterId,
      req.body ?? {},
      referenceCheck(suppliers, req),
      credits,
      events,
    );
    if (!result.ok) {
      const errorMessageString = result.errors
        .map((e) => ErrorMessage[e])
        .join('\n');
      res
        .status(statusFor(result.errors))
        .json({ message: errorMessageString });
      return;
    }

    // 201 with the open order: credits were reserved in this request (George, 2026-11-09).
    res.status(201).json(result.order);
  };

export const getOrders =
  (prisma: PrismaClient): RequestHandler =>
  async (req, res) => {
    const callerId = req.user?.user_id;
    if (!isUuid(callerId)) {
      res
        .status(401)
        .json({ message: ErrorMessage[ErrorCode.UNAUTHENTICATED] });
      return;
    }
    const result = await listOrders(prisma, callerId, req.query);
    if (!result.ok) {
      const message = result.errors
        .map((e) => `${ErrorMessage[e.code]} (${e.param})`)
        .join('\n');
      res.status(400).json({ message });
      return;
    }
    res.status(200).json(result);
  };

/** F12.1.3: the caller's active deliveries (as courier). */
export const getActiveDeliveries =
  (prisma: PrismaClient): RequestHandler =>
  async (req, res) => {
    const courierId = req.user?.user_id;
    if (!isUuid(courierId)) {
      res
        .status(401)
        .json({ message: ErrorMessage[ErrorCode.UNAUTHENTICATED] });
      return;
    }
    const orders = await listActiveDeliveries(prisma, courierId);
    res.status(200).json({ ok: true, orders });
  };

/** The caller's own orders: `?as=requester` (default) or `?as=courier`. */
export const getMyOrders =
  (prisma: PrismaClient): RequestHandler =>
  async (req, res) => {
    const unknown = Object.keys(req.query).filter((k) => k !== 'as');
    const as = req.query.as ?? 'requester';
    if (unknown.length || (as !== 'requester' && as !== 'courier')) {
      const param = unknown[0] ?? 'as';
      const code = unknown.length
        ? ErrorCode.UNKNOWN_QUERY_PARAMETER
        : ErrorCode.INVALID_QUERY_PARAMETER;
      res.status(400).json({ message: `${ErrorMessage[code]} (${param})` });
      return;
    }
    const userId = req.user?.user_id;
    if (!isUuid(userId)) {
      res
        .status(401)
        .json({ message: ErrorMessage[ErrorCode.UNAUTHENTICATED] });
      return;
    }
    const orders = await listMyOrders(prisma, userId, as);
    res.status(200).json({ ok: true, orders });
  };

/** One order, for its requester, courier or an admin; anyone else only while open. */
export const getOrderById =
  (prisma: PrismaClient): RequestHandler =>
  async (req, res) => {
    const user = req.user;
    if (!user || !isUuid(user.user_id)) {
      res
        .status(401)
        .json({ message: ErrorMessage[ErrorCode.UNAUTHENTICATED] });
      return;
    }
    const result = await ordersService.getOrder(
      prisma,
      user,
      req.params.id as string,
    );
    if (!result.ok) {
      res
        .status(statusFor([result.error]))
        .json({ message: ErrorMessage[result.error] });
      return;
    }
    res.status(200).json(result.order);
  };

export const editOrder =
  (
    prisma: PrismaClient,
    suppliers: SuppliersClient,
    events?: OrderEventPublisher,
  ): RequestHandler =>
  async (req, res) => {
    const actorId = req.user?.user_id;
    if (!isUuid(actorId)) {
      res
        .status(401)
        .json({ message: ErrorMessage[ErrorCode.UNAUTHENTICATED] });
      return;
    }
    const orderId = req.params.id as string;
    const payload = req.body ?? {};

    const result = await ordersService.editOrder(
      prisma,
      actorId,
      orderId,
      payload,
      referenceCheck(suppliers, req),
      events,
    );
    if (result.ok) {
      res.status(200).json(result.order);
    } else {
      const errorMessageString = result.errors
        .map((e) => ErrorMessage[e])
        .join('\n');
      res.status(statusFor(result.errors)).json({
        message: errorMessageString,
      });
    }
  };

export const transitionOrder =
  (
    prisma: PrismaClient,
    newStatus: RequestStatus,
    events?: OrderEventPublisher,
    userServiceUrl = 'http://localhost:3001',
  ): RequestHandler =>
  async (req, res) => {
    const actorId = req.user?.user_id;
    if (!isUuid(actorId)) {
      res
        .status(401)
        .json({ message: ErrorMessage[ErrorCode.UNAUTHENTICATED] });
      return;
    }

    const orderId = req.params.id as string;

    // const response = await ordersService.pickupOrder(prisma, actorId, orderId);
    const response = await ordersService.transitionOrder(
      prisma,
      orderId,
      newStatus,
      actorId,
      new Date(),
      {
        events,
        // AI-generated
        acceptanceUsername: async () => {
          const authorization = req.get('authorization');
          if (!authorization) return undefined;
          const response = await fetch(new URL('/users/me', userServiceUrl), {
            headers: { authorization },
          });
          if (!response.ok) {
            await response.body?.cancel();
            return undefined;
          }
          const profile = (await response.json()) as { username?: unknown };
          return typeof profile?.username === 'string' &&
            profile.username.trim()
            ? profile.username
            : undefined;
        },
      },
    );

    if (response.ok) {
      res.status(200).json(response);
    } else {
      const errors = [response.error];
      const errorCode = statusFor(errors);
      res.status(errorCode).json(response);
    }
  };

function statusFor(errors: ErrorCode[]): number {
  if (errors.includes(ErrorCode.CREDIT_SERVICE_UNAVAILABLE)) return 503;
  if (errors.includes(ErrorCode.SUPPLIER_SERVICE_UNAVAILABLE)) return 503;
  if (errors.includes(ErrorCode.SUPPLIER_NOT_FOUND)) return 422;
  if (errors.includes(ErrorCode.DELIVERY_LOCATION_NOT_FOUND)) return 422;
  if (errors.includes(ErrorCode.INSUFFICIENT_CREDITS)) return 422;
  if (errors.includes(ErrorCode.CREDIT_RESERVE_REJECTED)) return 422;
  if (errors.includes(ErrorCode.ORDER_PENDING_EXISTS)) return 409;
  if (errors.includes(ErrorCode.ORDER_NOT_FOUND)) return 404;
  if (errors.includes(ErrorCode.FORBIDDEN)) return 403;
  if (errors.includes(ErrorCode.INVALID_TRANSITION)) return 409;
  if (errors.includes(ErrorCode.ORDER_CONFLICT)) return 409;
  if (errors.includes(ErrorCode.ORDER_EXPIRED)) return 409;
  if (errors.includes(ErrorCode.ORDER_NOT_EDITABLE)) return 409;
  return 400;
}

// AI-generated
export const getAdminUserOrders =
  (prisma: PrismaClient, userServiceUrl: string): RequestHandler =>
  async (req, res) => {
    const fail = (status: number, code: ErrorCode) => {
      res.status(status).json({ message: ErrorMessage[code] });
    };
    if (!req.user || !isUuid(req.user.user_id)) {
      fail(401, ErrorCode.UNAUTHENTICATED);
      return;
    }
    if (req.user.role !== 'admin' && req.user.role !== 'super admin') {
      fail(403, ErrorCode.FORBIDDEN);
      return;
    }
    const rawUserId = req.params.userId;
    if (!isUuid(rawUserId)) {
      fail(400, ErrorCode.MALFORMED_USER_ID);
      return;
    }
    const userId = rawUserId.toLowerCase();
    const rawPage = req.query.page ?? '1';
    const page =
      typeof rawPage === 'string' && /^[1-9]\d*$/.test(rawPage)
        ? Number(rawPage)
        : NaN;
    const unknown = Object.keys(req.query).find((key) => key !== 'page');
    if (
      unknown ||
      !Number.isSafeInteger(page) ||
      !Number.isSafeInteger((page - 1) * ADMIN_USER_ORDERS_PAGE_SIZE)
    ) {
      const code = unknown
        ? ErrorCode.UNKNOWN_QUERY_PARAMETER
        : ErrorCode.INVALID_QUERY_PARAMETER;
      res
        .status(400)
        .json({ message: `${ErrorMessage[code]} (${unknown ?? 'page'})` });
      return;
    }
    const authorization = req.get('authorization');
    if (!authorization) {
      fail(401, ErrorCode.UNAUTHENTICATED);
      return;
    }
    let lookup: Response;
    try {
      lookup = await fetch(new URL(`/users/${userId}`, userServiceUrl), {
        headers: { authorization },
      });
      // Only existence is needed; do not retain the user's profile.
      await lookup.body?.cancel();
    } catch {
      fail(503, ErrorCode.USER_SERVICE_UNAVAILABLE);
      return;
    }
    if (lookup.status === 404) {
      fail(404, ErrorCode.INVALID_USER_ID);
      return;
    }
    if (lookup.status === 401 || lookup.status === 403) {
      fail(
        lookup.status,
        lookup.status === 401 ? ErrorCode.UNAUTHENTICATED : ErrorCode.FORBIDDEN,
      );
      return;
    }
    if (!lookup.ok) {
      fail(503, ErrorCode.USER_SERVICE_UNAVAILABLE);
      return;
    }
    res.status(200).json(await listAdminUserOrders(prisma, userId, page));
  };
