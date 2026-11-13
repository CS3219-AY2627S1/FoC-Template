import type { RequestHandler } from "express";
import { authorize } from "../services/authorization.service.ts";

export const authorizeRequest: RequestHandler = async (req, res) => {
    res.status(200).json(await authorize(req.body));
}