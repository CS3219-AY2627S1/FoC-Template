import express from "express";
import { announceAccount, getAccountBalance } from "../controllers/accountController.ts";

const router = express.Router();

router.post('/announce', announceAccount);
router.get('/:userId/balance', getAccountBalance);

export default router;
