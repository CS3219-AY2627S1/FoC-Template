/**
 * AI Assistance Disclosure
 * Tool: GitHub Copilot, date: 2026-10-20
 * Scope: Use User Service-local authentication and role authorization on role routes.
 * Author review: Review pending.
 */

import { Router } from "express";

import { authMiddleware, requireRoles } from "../middleware/authMiddleware.js";
import * as roleController from "../controllers/roleController.js";

const router = Router();

router.get("/users/:id/roles", authMiddleware, roleController.getUserRoles);
router.post("/users/:id/roles", authMiddleware, requireRoles("ADMIN"), roleController.addRole);
router.delete("/users/:id/roles/:role", authMiddleware, requireRoles("ADMIN"), roleController.removeRole);

export default router;
