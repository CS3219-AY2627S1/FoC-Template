import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { Role } from "../types/auth.types.js";
import { getMyBalance, getMyTransactions } from "../controllers/credit.controller.js";

const creditRouter = Router();

// Credit reads are available only to authenticated students.
creditRouter.use(authenticate);
creditRouter.get("/me/balance", authorize(Role.STUDENT), getMyBalance);
creditRouter.get("/me/transactions", authorize(Role.STUDENT), getMyTransactions);

export default creditRouter;
