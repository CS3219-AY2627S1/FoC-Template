import type { Request, Response } from "express";
import { getErrorMessage } from "../utils/error.ts";
import { paginationParams } from "../utils/pagination.ts";
import { canReadAccount, isAdministrator } from "../middleware.ts/auth.ts";
import { findTransactions, findTransactionsByUserId, findTransactionsByErrandRef } from "../models/database/credit-service/transactionsCollection.ts";

// F4.5.3 (admin): the credit ledger for the dashboard, newest first and paginated, optionally
// scoped to one account with ?userId=. Administrators only; the route runs behind authorize(), so a
// member who reaches it is authorized but not permitted to see everyone's movements, hence 403.
export const getTransactions = async (req: Request, res: Response) => {
    if (!isAdministrator(res.locals.roles)) {
        return res.status(403).send("Forbidden");
    }
    const { page, pageSize } = paginationParams(req.query);
    const userId = req.query.userId ? String(req.query.userId) : undefined;
    try {
        const result = await findTransactions({ userId, page, pageSize });
        res.status(200).send(result);
    } catch (error) {
        return res.status(500).send(getErrorMessage(error));
    }
};

export const getTransactionsByUser = async (req: Request, res: Response) => {
    const userId = String(req.params.userId);
    if (!canReadAccount(res.locals.accountId, res.locals.roles, userId)) {
        return res.status(403).send("Forbidden");
    }
    try {
        const transactions = await findTransactionsByUserId(userId);
        res.status(200).send(transactions);
    } catch (error) {
        return res.status(500).send(getErrorMessage(error));
    }
};

export const getTransactionsByErrand = async (req: Request, res: Response) => {
    try {
        const transactions = await findTransactionsByErrandRef(String(req.params.errandRef));
        res.status(200).send(transactions);
    } catch (error) {
        return res.status(500).send(getErrorMessage(error));
    }
};
