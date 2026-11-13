import express from "express";
import { reserve, transfer, release } from "../controllers/reservationController.ts";

const router = express.Router();

router.post('/reserve', reserve);
router.post('/transfer', transfer);
router.post('/release', release);

export default router;
