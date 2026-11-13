import type { Request, Response } from "express";
import { getErrorMessage } from "../utils/error.ts";
import { reserveCredits, transferCredits, releaseCredits } from "../services/reservationService.ts";

export const reserve = async (req: Request, res: Response) => {
    try {
        await reserveCredits(req.body.userId, req.body.errandRef, req.body.amount);
        res.status(200).send('Credits reserved');
    } catch (error) {
        return res.status(400).send(getErrorMessage(error));
    }
};

export const transfer = async (req: Request, res: Response) => {
    try {
        await transferCredits(req.body.errandRef, req.body.courierId);
        res.status(200).send('Credits transferred');
    } catch (error) {
        return res.status(400).send(getErrorMessage(error));
    }
};

export const release = async (req: Request, res: Response) => {
    try {
        await releaseCredits(req.body.errandRef);
        res.status(200).send('Credits released');
    } catch (error) {
        return res.status(400).send(getErrorMessage(error));
    }
};
