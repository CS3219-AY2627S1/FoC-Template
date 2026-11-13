import { Router } from "express";
import { authorizeRequest } from "../controllers/internal.controller.ts";

export const internalRouter = Router();

internalRouter.post("/authorize", authorizeRequest)