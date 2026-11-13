import { type NextFunction, type Request, type Response } from 'express';
import { 
    getTransactionsByUserService,
    reserveCreditsService,
    transferCreditsService,
    releaseCreditsService
} from '../service/transactionService.ts';

export const getTransactionsByUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.params.user_id as string;
        const transactions = await getTransactionsByUserService(userId);
        res.status(200).json(transactions);
    } catch (error: any) {
        const errorWithMessage = new Error(`Failed to fetch transactions: ${error.message}`);
        next(errorWithMessage);
    }
};

export const reserveCredits = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const transaction = await reserveCreditsService(req.body);
        res.status(200).json(transaction);
    } catch (error: any) {
        const errorWithMessage = new Error(`Failed to reserve credits: ${error.message}`);
        next(errorWithMessage);
    }
};

export const transferCredits = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const transaction = await transferCreditsService(req.body);
        res.status(200).json(transaction);
    } catch (error: any) {
        const errorWithMessage = new Error(`Failed to transfer credits: ${error.message}`);
        next(errorWithMessage);
    }
};

export const releaseCredits = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const transaction = await releaseCreditsService(req.body);
        res.status(200).json(transaction);
    } catch (error: any) {
        const errorWithMessage = new Error(`Failed to release credits: ${error.message}`);
        next(errorWithMessage);
    }
};