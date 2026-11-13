import { type NextFunction, type Request, type Response } from 'express';
import { 
    initializeWalletService,
    getWalletService,
} from '../service/walletService.ts';

export const initializeWallet = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.params.user_id as string;
        const wallet = await initializeWalletService(userId);
        res.status(201).json(wallet);
    } catch (error: any) {
        const errorWithMessage = new Error(`Failed to initialize wallet: ${error.message}`);
        next(errorWithMessage);
    }
};

export const getWallet = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.params.user_id as string;
        const wallet = await getWalletService(userId);
        if (!wallet) {
            res.status(404).json({ message: "Wallet not found" });
            return;
        }
        res.status(200).json(wallet);
    } catch (error: any) {
        const errorWithMessage = new Error(`Failed to fetch wallet: ${error.message}`);
        next(errorWithMessage);
    }
};
