import type { Event } from "../broker.ts";

type Database = { query(sql: string, values?: unknown[]): Promise<{ rows: any[] }> };

// An errand nobody accepted by its needed-by time is of no use any more, so its reward is released.
export async function expireOverdueOrders(db: Database): Promise<void> {
    await db.query(`
        WITH expired AS (
            UPDATE orders SET status = 'Expired', updated_at = now()
            WHERE status = 'Open' AND needed_by_time <= now()
            RETURNING id
        ), logged AS (
            INSERT INTO order_transitions (order_id, from_status, to_status, actor)
            SELECT id, 'Open', 'Expired', 'system' FROM expired
        )
        INSERT INTO order_outbox (type, data)
        SELECT 'order.errand.expired', jsonb_build_object('errandRef', id::text)
        FROM expired;
    `);
}

export async function relayOutbox(db: Database, publish: (event: Event) => Promise<void>): Promise<void> {
    await expireOverdueOrders(db);

    // A crash during reservation leaves a Pending order. Reject it and release any
    // remote reservation without needing to keep the user's session credentials.
    await db.query(`
        WITH rejected AS (
            UPDATE orders SET status = 'Rejected', updated_at = now()
            WHERE status = 'Pending' AND created_at < now() - interval '1 minute'
            RETURNING id
        ), logged AS (
            INSERT INTO order_transitions (order_id, from_status, to_status, actor)
            SELECT id, 'Pending', 'Rejected', 'system' FROM rejected
        )
        INSERT INTO order_outbox (type, data)
        SELECT 'order.errand.cancelled', jsonb_build_object('errandRef', id::text)
        FROM rejected;
    `);

    // Claims a batch for 30 seconds. Another instance skips it, and if this one dies the
    // claim runs out and the events are sent by whoever comes next.
    const { rows } = await db.query(`
        UPDATE order_outbox SET claimed_until = now() + interval '30 seconds'
        WHERE event_id IN (
            SELECT event_id FROM order_outbox
            WHERE sent_at IS NULL AND (claimed_until IS NULL OR claimed_until < now())
            ORDER BY occurred_at LIMIT 50
            FOR UPDATE SKIP LOCKED
        )
        RETURNING event_id, type, data, occurred_at;
    `);
    rows.sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime());
    for (const [index, row] of rows.entries()) {
        try {
            await publish({ eventId: row.event_id, type: row.type, data: row.data, occurredAt: row.occurred_at.toISOString() });
        } catch (error) {
            // Hand the rest back at once, so the next pass does not wait for the claim to run out.
            const unsent = rows.slice(index).map((unsentRow) => unsentRow.event_id);
            await db.query("UPDATE order_outbox SET claimed_until = NULL WHERE event_id = ANY($1::uuid[])", [unsent]);
            throw error;
        }
        await db.query("UPDATE order_outbox SET sent_at = now() WHERE event_id = $1", [row.event_id]);
    }
}

export function startOutboxRelay(db: Database, publish: (event: Event) => Promise<void>, onError: (error: unknown) => void) {
    let stopped = false;
    let timer: NodeJS.Timeout;
    let active: Promise<void> = Promise.resolve();
    const pass = async () => {
        try {
            await relayOutbox(db, publish);
        } catch (error) {
            onError(error);
        }
        if (!stopped) timer = setTimeout(() => { active = pass(); }, 1000);
    };
    active = pass();
    return async () => {
        stopped = true;
        clearTimeout(timer);
        await active;
    };
}
