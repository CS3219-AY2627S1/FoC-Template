// AI Assistance Disclosure:
// Tool: Gemini (model: 3.1 Pro), date: 2026-09-27
// Scope: Provided function names and the Supplier model, AI was used to implement the CRUD operations
// Author review: Code manually reviewed and verified

import pool from "../config/db.ts";
import { type Supplier, type CreateSupplierDTO } from "../models/types.ts"

export const getAllSuppliersService = async (userId: string): Promise<Supplier[]> => {
    const query = `SELECT s.* , 
        EXISTS (SELECT 1 FROM favourites f WHERE f.supplier_id = s.id AND f.user_id = $1) AS is_favourite
        FROM suppliers s;
    `;
    const result = await pool.query<Supplier>(query, [userId || null]);
    return result.rows;
};

export const getSupplierByIdService = async (id: string, userId: string): Promise<Supplier> => {
    const query = `SELECT s.* , 
        EXISTS (SELECT 1 FROM favourites f WHERE f.supplier_id = s.id AND f.user_id = $1) AS is_favourite
        FROM suppliers s
        WHERE s.id = $2;
    `;
    const result = await pool.query<Supplier>(query, [userId || null, id]);
    return result.rows[0];
};


export const searchSuppliersService = async (searchTerm: string, userId: string): Promise<Supplier[]> => {
    const query = `
        SELECT *, 
        EXISTS (SELECT 1 FROM favourites f WHERE f.supplier_id = s.id AND f.user_id = $1) AS is_favourite
        FROM suppliers s
        WHERE s.name ILIKE $2 OR s.type ILIKE $2 OR s.building ILIKE $2
        ORDER BY s.name ASC;
    `;
    const result = await pool.query<Supplier>(query, [userId, `%${searchTerm}%`]);
    return result.rows;
};

export const addSupplierService = async (data: CreateSupplierDTO): Promise<Supplier> => {
    const query = `
        INSERT INTO suppliers (
            name, type, building, floor, location_description, 
            latitude, longitude, starting_time, closing_time, image_url, is_active
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, true)
        ) RETURNING *;
    `;
    
    const values = [
        data.name, data.type, data.building, data.floor, data.location_description,
        data.latitude, data.longitude, data.starting_time, data.closing_time, data.image_url, data.is_active
    ];

    const result = await pool.query<Supplier>(query, values);
    return result.rows[0];
};

/** Only real suppliers-table columns — blocks fields like is_favourite from breaking UPDATE. */
const SUPPLIER_UPDATE_COLUMNS = [
    "name",
    "type",
    "building",
    "floor",
    "location_description",
    "latitude",
    "longitude",
    "starting_time",
    "closing_time",
    "image_url",
    "is_active",
] as const;

type SupplierUpdateColumn = (typeof SUPPLIER_UPDATE_COLUMNS)[number];

export const updateSupplierService = async (id: string, data: Partial<CreateSupplierDTO>): Promise<Supplier | null> => {
    const keys = (Object.keys(data) as (keyof CreateSupplierDTO)[]).filter(
        (key): key is SupplierUpdateColumn =>
            (SUPPLIER_UPDATE_COLUMNS as readonly string[]).includes(key) &&
            data[key] !== undefined
    );
    if (keys.length === 0) return null;

    const setString = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = keys.map((key) => data[key]);

    const query = `
        UPDATE suppliers 
        SET ${setString}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 
        RETURNING *;
    `;

    const result = await pool.query<Supplier>(query, [id, ...values]);
    return result.rows[0] || null;
};

export const deactivateSupplierService = async (id: string): Promise<Supplier | null> => {
    const query = `
        UPDATE suppliers 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1 
        RETURNING *;
    `;
    
    const result = await pool.query<Supplier>(query, [id]);
    return result.rows[0] || null;
};

export const addFavouriteService = async (supplierId: string, userId: string): Promise<{ user_id: string, supplier_id: string }> => {
    const query = `
        INSERT INTO favourites (user_id, supplier_id) 
        VALUES ($1, $2) 
        RETURNING *;
    `;
    
    const result = await pool.query(query, [userId, supplierId]);
    return result.rows[0];
};

export const deleteFavouriteService = async (supplierId: string, userId: string): Promise<boolean> => {
    const query = `
        DELETE FROM favourites 
        WHERE user_id = $1 AND supplier_id = $2;
    `;
    
    const result = await pool.query(query, [userId, supplierId]);
    return (result.rowCount ?? 0) > 0;
};
