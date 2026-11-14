// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
// Scope: Stage 26d - GET /admin/audit-logs, behind authenticate + authorize('admin').
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import { Router } from "express";
import * as auditLogController from "../controllers/auditLog.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

router.get("/", authenticate, authorize("admin"), auditLogController.list);

export default router;
