import { param } from "@prisma/orm-postgres/relational-core/expression";
import { activeOrderStatuses, orderStatuses, overdueOrderStatuses, type OrderSnapshot } from "../telemetry/order.ts";
import { db } from "./db.ts";

export const getOrderSnapshot = async (pendingTimeoutMinutes: number): Promise<OrderSnapshot> => {
    const plan = db.raw.sql`
        SELECT status, COUNT(*)::text AS count,
            (COUNT(*) FILTER (WHERE
                (status = 'PENDING' AND "createdAt" < now() - make_interval(mins => ${param(pendingTimeoutMinutes, { codecId: "pg/int4@1" })}))
                OR (status IN ('OPEN', 'ACCEPTED', 'COLLECTED') AND "expiresAt" <= now())
            ))::text AS overdue,
            GREATEST(0, EXTRACT(EPOCH FROM now() - MIN("createdAt")))::text AS age
        FROM orders GROUP BY status
    `.returnsRow({ status: "pg/text@1", count: "pg/text@1", overdue: "pg/text@1", age: "pg/text@1" }).build();
    const rows = await db.runtime().query(plan);
    const snapshot: OrderSnapshot = {
        counts: { PENDING: 0, REJECTED: 0, OPEN: 0, ACCEPTED: 0, COLLECTED: 0, DELIVERED: 0, CANCELLED: 0, EXPIRED: 0 },
        overdue: { PENDING: 0, OPEN: 0, ACCEPTED: 0, COLLECTED: 0 },
        oldestPendingAge: 0,
        oldestActiveAge: 0,
    };
    for (const row of rows) {
        const status = orderStatuses.find(status => status === row.status);
        if (!status)
            throw new Error("Unknown order status in metrics snapshot");
        // Decode counts without an int4 cast; the monitor validates safe integer precision.
        snapshot.counts[status] = Number(row.count);
        const overdueStatus = overdueOrderStatuses.find(status => status === row.status);
        if (overdueStatus)
            snapshot.overdue[overdueStatus] = Number(row.overdue);
        if (status === "PENDING")
            snapshot.oldestPendingAge = Number(row.age);
        if (activeOrderStatuses.some(status => status === row.status))
            snapshot.oldestActiveAge = Math.max(snapshot.oldestActiveAge, Number(row.age));
    }
    return snapshot;
};
