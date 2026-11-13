import type { CreditSnapshot } from "../telemetry/credit.ts";
import { db } from "./db.ts";

export const getCreditSnapshot = async (): Promise<CreditSnapshot> => {
    const plan = db.raw.sql`
        SELECT balances.total::text AS available, holds.total::text AS held, holds.count::text AS holds
        FROM (
            SELECT COALESCE(SUM(balance), 0) AS total FROM "UserCredits"
        ) AS balances
        CROSS JOIN (
            SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
            FROM "CreditsOnHold" WHERE status = 'HELD'
        ) AS holds
    `.returnsRow({ available: "pg/text@1", held: "pg/text@1", holds: "pg/text@1" }).build();
    const [row] = await db.runtime().query(plan);
    // Decode bigint aggregates through text; the monitor rejects values beyond safe integer precision.
    return { available: Number(row.available), held: Number(row.held), holds: Number(row.holds) };
};
