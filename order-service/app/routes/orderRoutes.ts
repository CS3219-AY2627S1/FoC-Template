import express from "express";
import { authenticate, requireRoles } from "../middleware/auth.ts";
import {
  acceptOrder,
  cancelOrder,
  completeOrder,
  createOrder,
  getAllOrders,
  getOrderById,
  pickupOrder,
} from "../controllers/orderController.ts";

const router = express.Router();
const requireAnyRole = requireRoles("ADMIN", "REQUESTER", "COURIER");
const requireRequesterRole = requireRoles("REQUESTER");
const requireCourierRole = requireRoles("COURIER");

// POST api/orders
router.post("/", authenticate, requireRequesterRole, createOrder);

// GET api/orders
router.get("/", authenticate, requireAnyRole, getAllOrders);

// GET api/orders/:id
router.get("/:id", authenticate, requireAnyRole, getOrderById);

// POST api/orders/:id/accept | pickup | complete | cancel
router.post("/:id/accept", authenticate, requireCourierRole, acceptOrder);
router.post("/:id/pickup", authenticate, requireCourierRole, pickupOrder);
router.post("/:id/complete", authenticate, requireRequesterRole, completeOrder);
router.post("/:id/cancel", authenticate, requireRequesterRole, cancelOrder);

export default router;