// AI Assistance Disclosure:
// Tool: Gemini (model: 3.1 Pro), date: 2026-10-15
// Scope: Given function names and description, and SQL Schema, generated basic SQL queries, which were then edited to fit specifications
// Author review: Validated correctness of SQL queries, tested with Postman to check correctness

import pool from "../config/db.ts";
import { type TransactionRecord } from "../models/types.ts";

export const getTransactionsByUserService = async (userId: string): Promise<TransactionRecord[]> => {
    const query = `SELECT * FROM transaction_records WHERE user_id = $1 ORDER BY created_at DESC;`
    const result = await pool.query<TransactionRecord>(query, [userId]);
    return result.rows;
};

export const reserveCreditsService = async (data: any): Promise<TransactionRecord> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); 

        const updateWalletQuery = `
            UPDATE wallets 
            SET available_credits = available_credits - $1, 
                reserved_credits = reserved_credits + $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $2 AND available_credits >= $1
            RETURNING *;
        `;
        
        const walletResult = await client.query(updateWalletQuery, [data.amount, data.requester_id]);

        if (walletResult.rowCount === 0) {
            throw new Error("Insufficient available credits or wallet not found");
        }

        const insertTxQuery = `
            INSERT INTO transaction_records (user_id, order_id, type, amount)
            VALUES ($1, $2, 'RESERVE', $3)
            RETURNING *;
        `;
        const txResult = await client.query<TransactionRecord>(insertTxQuery, [data.requester_id, data.order_id, data.amount]);

        await client.query('COMMIT');
        return txResult.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const transferCreditsService = async (data: any): Promise<TransactionRecord> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const deductRequesterQuery = `
            UPDATE wallets 
            SET reserved_credits = reserved_credits - $1, 
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $2 AND reserved_credits >= $1
            RETURNING *;
        `;
        const deductResult = await client.query(deductRequesterQuery, [data.amount, data.requester_id]);

        if (deductResult.rowCount === 0) {
            throw new Error("Insufficient reserved credits for requester");
        }

        const addCourierQuery = `
            UPDATE wallets 
            SET available_credits = available_credits + $1, 
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $2;
        `;
        
        await client.query(addCourierQuery, [data.amount, data.courier_id]);

        const insertTxQuery = `
            INSERT INTO transaction_records (user_id, order_id, type, amount)
            VALUES 
                ($1, $3, 'DEDUCT', $4),
                ($2, $3, 'CREDIT', $4)
            RETURNING *;
        `;
        const txResult = await client.query<TransactionRecord>(insertTxQuery, [
            data.requester_id, data.courier_id, data.order_id, data.amount
        ]);

        await client.query('COMMIT');
        
        return txResult.rows[1]; 
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const releaseCreditsService = async (data: any): Promise<TransactionRecord> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const releaseWalletQuery = `
            UPDATE wallets 
            SET reserved_credits = reserved_credits - $1,
                available_credits = available_credits + $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $2 AND reserved_credits >= $1
            RETURNING *;
        `;
        
        const walletResult = await client.query(releaseWalletQuery, [data.amount, data.requester_id]);

        if (walletResult.rowCount === 0) {
            throw new Error("Insufficient reserved credits or wallet not found");
        }

        const insertTxQuery = `
            INSERT INTO transaction_records (user_id, order_id, type, amount)
            VALUES ($1, $2, 'RELEASE', $3)
            RETURNING *;
        `;
        const txResult = await client.query<TransactionRecord>(insertTxQuery, [data.requester_id, data.order_id, data.amount]);

        await client.query('COMMIT');
        return txResult.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/** Same wallet movement as cancellation. A second release for this order is a no-op. */
export const releaseCreditsOnceService = async (data: any): Promise<TransactionRecord> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `SELECT pg_advisory_xact_lock(hashtext('order-expiry'), hashtext($1::text))`,
            [data.order_id]
        );

        const existing = await client.query<TransactionRecord>(
            `SELECT * FROM transaction_records
             WHERE order_id = $1 AND type = 'RELEASE'
             LIMIT 1`,
            [data.order_id]
        );
        if ((existing.rowCount ?? 0) > 0 && existing.rows[0]) {
            await client.query('COMMIT');
            return existing.rows[0];
        }

        const releaseWalletQuery = `
            UPDATE wallets
            SET reserved_credits = reserved_credits - $1,
                available_credits = available_credits + $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $2 AND reserved_credits >= $1
            RETURNING *;
        `;
        const walletResult = await client.query(releaseWalletQuery, [data.amount, data.requester_id]);
        if (walletResult.rowCount === 0) {
            throw new Error("Insufficient reserved credits or wallet not found");
        }

        const insertTxQuery = `
            INSERT INTO transaction_records (user_id, order_id, type, amount)
            VALUES ($1, $2, 'RELEASE', $3)
            RETURNING *;
        `;
        const txResult = await client.query<TransactionRecord>(insertTxQuery, [
            data.requester_id,
            data.order_id,
            data.amount,
        ]);

        await client.query('COMMIT');
        return txResult.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};