// AI Assistance Disclosure:
// Tool: GitHub Copilot, date: 2026-10-20
// Scope: Use User Service-local authentication and RBAC instead of common middleware.
// Author review: Review pending.

// AI Assistance Disclosure:
// Tool: Gemini, date: 2026-10-03
// Scope: Added POST /me/change-password route for authenticated password modification.
// Author review: Verified route order and authentication middleware protection.

import { Router } from "express";

import { authMiddleware, requireRoles } from "../middleware/authMiddleware.js";
import * as userController from "../controllers/userController.js";

const router = Router();

router.get("/", authMiddleware, requireRoles("ADMIN"), userController.listUsers);
router.get("/me", authMiddleware, userController.getCurrentUserProfile);
router.patch("/me", authMiddleware, userController.updateCurrentUserProfile);
router.post("/me/change-password", authMiddleware, userController.changePassword);
router.post("/batch", authMiddleware, userController.getUsersBatch);
router.patch("/:id/status", authMiddleware, requireRoles("ADMIN"), userController.updateUserStatus);
router.get("/:userId", authMiddleware, userController.getUserById);

export default router;
