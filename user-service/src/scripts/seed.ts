// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-29
// Scope: Generated the initial implementation of the Day 0 admin bootstrap
// script based on the finalized team design.
// Author review: Reviewed and validated against the finalized project design.

import { pool } from "../config/db.js";
import { provisionInitialAdmin } from "../services/userService.js";

const BOOTSTRAP_FLAG = "INITIAL_BOOTSTRAP_COMPLETED";
const ADVISORY_LOCK_ID = 74839201;

const getEnv = (name: string): string | undefined => {
    const value = process.env[name];

    if (!value) {
        return undefined;
    }

    return value.trim();
};

const hasCompletedBootstrap = async (): Promise<boolean> => {
    const result = await pool.query(
        `SELECT 1
         FROM system_metadata
         WHERE key = $1`,
        [BOOTSTRAP_FLAG]
    );

    return result.rows.length > 0;
};

const main = async (): Promise<void> => {
    // ============================================================
    // Initial Flag Check
    // ============================================================

    if (await hasCompletedBootstrap()) {
        console.log(
            "Initial admin bootstrap has already completed. Nothing to do."
        );
        return;
    }

    // ============================================================
    // Bootstrap Credentials
    // ============================================================

    const email = getEnv("INITIAL_ADMIN_EMAIL");
    const password = getEnv("INITIAL_ADMIN_PASSWORD");

    if (!email || !password) {
        throw new Error(
            "INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are required for an uninitialized database."
        );
    }

    const username =
        getEnv("INITIAL_ADMIN_USERNAME") || "admin";

    const firstName =
        getEnv("INITIAL_ADMIN_FIRST_NAME") || "System";

    const lastName =
        getEnv("INITIAL_ADMIN_LAST_NAME") || "Admin";

    // ============================================================
    // Bootstrap Transaction
    // ============================================================

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        await client.query(
            "SELECT pg_advisory_xact_lock($1)",
            [ADVISORY_LOCK_ID]
        );

        // ========================================================
        // Double Check After Advisory Lock
        // ========================================================

        const completedResult = await client.query(
            `SELECT 1
             FROM system_metadata
             WHERE key = $1`,
            [BOOTSTRAP_FLAG]
        );

        if (completedResult.rows.length > 0) {
            await client.query("COMMIT");

            console.log(
                "Initial admin bootstrap was completed by another instance. Nothing to do."
            );

            return;
        }

        // ========================================================
        // Initial Admin Provisioning
        // ========================================================

        await provisionInitialAdmin(
            {
                email,
                password,
                username,
                firstName,
                lastName,
            },
            client
        );

        // ========================================================
        // Record Bootstrap Completion
        // ========================================================

        await client.query(
            `INSERT INTO system_metadata (key, value)
             VALUES ($1, $2)`,
            [BOOTSTRAP_FLAG, "true"]
        );

        await client.query("COMMIT");

        console.log(
            "Initial admin bootstrap completed successfully."
        );
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "Failed to rollback bootstrap transaction:",
                rollbackError
            );
        }

        throw error;
    } finally {
        client.release();
    }
};

try {
    await main();
} catch (error) {
    console.error(
        "Admin bootstrap failed:",
        error instanceof Error ? error.message : error
    );

    process.exitCode = 1;
} finally {
    await pool.end();
}
