// AI Assistance Disclosure:
// Tool: Gemini (model: 3.1 Pro), date: 2026-09-27
// Scope: Provided function names and the Supplier model, AI was used to implement the CRUD operations
// Author review: Code manually reviewed and verified

import { type NextFunction, type Request, type Response } from 'express';
import { 
    getAllSuppliersService,
    searchSuppliersService,
    addSupplierService,
    updateSupplierService,
    deactivateSupplierService,
    getSupplierByIdService,
    addFavouriteService,
    deleteFavouriteService
} from '../service/supplierService.ts';

export const getAllSuppliers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const suppliers = await getAllSuppliersService(userId);
        res.status(200).json(suppliers);
    } catch (error: any) {
        const errorWithMessage = new Error(`Failed to fetch suppliers: ${error.message}`);
        next(errorWithMessage);
    }
};

export const getSupplierById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const supplier = await getSupplierByIdService(req.params.id as string, userId);
        res.status(200).json(supplier);
    } catch (error: any) {
        const errorWithMessage = new Error(`Failed to fetch supplier by id: ${error.message}`);
        next(errorWithMessage);
    }
};

export const searchSuppliers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const searchTerm = req.query.q as string; 
        const userId = (req as any).user.id;
        if (!searchTerm) {
            res.status(400).json({ message: "Search term 'q' is required" });
            return;
        }
        const suppliers = await searchSuppliersService(searchTerm, userId);
        res.status(200).json(suppliers);
    } catch (error: any) {
        const errorWithMessage = new Error(`Failed to search suppliers: ${error.message}`);
        next(errorWithMessage);
    }
};

export const addSupplier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const newSupplier = await addSupplierService(req.body);
        res.status(201).json(newSupplier);
    } catch (error: any) {
        const errorWithMessage = new Error(`Failed to add supplier: ${error.message}`);
        next(errorWithMessage);
    }
};

export const updateSupplier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const id = req.params.id as string;
        const updatedSupplier = await updateSupplierService(id, req.body);
        if (!updatedSupplier) {
            res.status(404).json({ message: "Supplier not found or no data provided" });
            return;
        }
        
        res.status(200).json(updatedSupplier);
    } catch (error: any) {
        next(new Error(`Failed to update supplier: ${error.message}`));
    }
};

export const deactivateSupplier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const id = req.params.id as string;
        const deactivatedSupplier = await deactivateSupplierService(id);
        if (!deactivatedSupplier) {
            res.status(404).json({ message: "Supplier not found" });
            return;
        }
        res.status(200).json(deactivatedSupplier);
    } catch (error: any) {
        next(new Error(`Failed to deactivate supplier: ${error.message}`));
    }
};

export const addFavourite = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const supplierId = req.params.id as string;
        const userId = (req as any).user.id;
        const favouritedSupplier = await addFavouriteService(supplierId, userId);
        res.status(200).json(favouritedSupplier);
    } catch (error: any) {
        next(new Error(`Failed to add favourite: ${error.message}`));
    }
};


export const deleteFavourite = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const supplierId = req.params.id as string;
        const userId = (req as any).user.id;
        const isDeleted = await deleteFavouriteService(supplierId, userId);
        if (!isDeleted) {
            res.status(404).json({ message: "Favourite not found" });
            return;
        }
        res.status(200).json({message: "Favourite deleted"});
    } catch (error: any) {
        next(new Error(`Failed to remove favourite: ${error.message}`));
    }
};