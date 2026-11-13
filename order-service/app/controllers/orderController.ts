import type { Request, RequestHandler } from "express";
import type { AuthenticatedUser } from "../middleware/auth.ts";
import * as orderService from "../service/orderService.ts";
import { unauthorized } from "../utils/httpError.ts";

// authenticate() always sets req.user before these run; this narrows the type
const currentUser = (req: Request): AuthenticatedUser => {
  if (!req.user) throw unauthorized("Authentication required.");
  return req.user;
};

const orderId = (req: Request): string => String(req.params.id);

export const createOrder: RequestHandler = async (req, res) => {
  const order = await orderService.createOrder(currentUser(req), req.body);
  res.status(201).json(order);
};

export const getOrderById: RequestHandler = async (req, res) => {
  res.json(await orderService.getOrder(currentUser(req), orderId(req)));
};

export const getAllOrders: RequestHandler = async (req, res) => {
  res.json(await orderService.listOrders(currentUser(req), req.query));
};

export const acceptOrder: RequestHandler = async (req, res) => {
  res.json(await orderService.accept(currentUser(req), orderId(req)));
};

export const pickupOrder: RequestHandler = async (req, res) => {
  res.json(await orderService.pickup(currentUser(req), orderId(req)));
};

export const completeOrder: RequestHandler = async (req, res) => {
  res.json(await orderService.complete(currentUser(req), orderId(req)));
};

export const cancelOrder: RequestHandler = async (req, res) => {
  res.json(await orderService.cancel(currentUser(req), orderId(req)));
};