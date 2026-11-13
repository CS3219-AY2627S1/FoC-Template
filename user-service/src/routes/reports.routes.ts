import { Router } from "express";
import { decide, file, getOne, list } from "../controllers/reports.controller.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireRole } from "../middleware/requireRole.ts";

export const reportsRouter = Router();

reportsRouter.use(authenticate);

// Any logged-in account may report another one (F1.5.4: the member role suffices)
reportsRouter.post("/", file);

const adminOnly = requireRole("administrator");
reportsRouter.get("/", adminOnly, list);
reportsRouter.get("/:id", adminOnly, getOne);
reportsRouter.post("/:id/decision", adminOnly, decide);
