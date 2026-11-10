import type { Request, Response } from "express";
import { AppError } from "../errors/errors.js";
import { getSupplierByIdService } from "../services/supplier.service.js";

export async function getSupplierById(req: Request, res: Response) {
    const supplierId = req.params.supplierId;

    if (typeof supplierId !== "string" || !supplierId) {
        throw new AppError("Supplier id is required", 400);
    }

    const supplier = await getSupplierByIdService(supplierId);

    if (!supplier) {
        throw new AppError("Supplier not found", 404, "SUPPLIER_NOT_FOUND");
    }

    res.status(200).json({
        success: true,
        message: "Supplier fetched successfully",
        data: supplier,
    });
}
