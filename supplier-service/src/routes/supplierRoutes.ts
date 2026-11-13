/**
 * AI Assistance Disclosure
 * Tool: GitHub Copilot, date: 2026-10-20
 * Scope: Switch supplier routes from common auth helpers to service-local middleware.
 * Author review: Review pending.
 */

/**
 * AI Assistance Disclosure
 * Tool: GitHub Copilot (GPT-6 Luna)
 * Scope: Require authentication and allow all defined roles on each supplier API route.
 * Author review: Reviewed and manually edited to allow the correct roles for each route
 */

import express from "express";

import { authMiddleware, requireRoles } from "../middleware/authMiddleware.ts";
import {
  addFavourite,
  addSupplier,
  deactivateSupplier,
  deleteFavourite,
  getAllSuppliers,
  getSupplierById,
  searchSuppliers,
  updateSupplier,
} from "../controllers/supplierController.ts";

const router = express.Router();
const requireAnyRole = requireRoles("ADMIN", "REQUESTER", "COURIER");
const requireAdminRole = requireRoles("ADMIN");

router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// GET api/suppliers/
router.get("/", authMiddleware, requireAnyRole, getAllSuppliers);

// GET api/suppliers/search
router.get("/search", authMiddleware, requireAnyRole, searchSuppliers);

// GET api/suppliers/:id
router.get("/:id", authMiddleware, requireAnyRole, getSupplierById);

// POST api/suppliers
router.post("/", authMiddleware, requireAdminRole, addSupplier);

// PATCH api/suppliers/deactivate/:id
router.patch("/deactivate/:id", authMiddleware, requireAdminRole, deactivateSupplier);

// PATCH api/suppliers/:id
router.patch("/:id", authMiddleware, requireAdminRole, updateSupplier);

// PUT api/suppliers/:id/favourite
router.put("/:id/favourite", authMiddleware, requireAnyRole, addFavourite);

// DELETE api/suppliers/:id/favourite
router.delete("/:id/favourite", authMiddleware, requireAnyRole, deleteFavourite);

export default router;