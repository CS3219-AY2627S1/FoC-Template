import { pool } from "../db.ts";
import type { QueryResult } from "pg";
import type { WalkingRoute } from "../services/clients.ts";

export type OrderStatus =
    | "Pending"
    | "Open"
    | "Accepted"
    | "PickedUp"
    | "Delivered"
    | "Completed"
    | "Cancelled"
    | "Expired"
    | "Rejected";

export interface Order {
    id: number;
    requester_id: string;
    courier_id: string | null;
    supplier_id: string;
    delivery_location: string;
    needed_by_time: Date;
    item_lines: string[];
    credit_reward: number;
    status: OrderStatus;
    created_at: Date;
    updated_at: Date;
    // Null on errands created before these existed. The route is also null when it could not be measured.
    pickup_latitude: number | null;
    pickup_longitude: number | null;
    delivery_latitude: number | null;
    delivery_longitude: number | null;
    route_metres: number | null;
    route_seconds: number | null;
    route_estimated: boolean | null;
}

export interface OrderTransition {
    from_status: OrderStatus;
    to_status: OrderStatus;
    actor: string;
    occurred_at: Date;
}

export interface OrderWithHistory extends Order {
    transitions: OrderTransition[];
}

export interface CreateOrderData {
    requesterId: string;
    supplierId: string;
    deliveryLocation: string;
    neededByTime: string;
    itemLines: string[];
    creditReward: number;
    deliveryLatitude: number;
    deliveryLongitude: number;
    route: WalkingRoute | null;
}

export interface AdminOrders {
    orders: Order[];
    page: number;
    pageSize: number;
    total: number;
}

export const OrderModel = {
    async create(data: CreateOrderData): Promise<Order> {
        const query = `
            INSERT INTO orders (
                requester_id, supplier_id, delivery_location,
                needed_by_time, item_lines, credit_reward, status,
                delivery_latitude, delivery_longitude, pickup_latitude, pickup_longitude,
                route_metres, route_seconds, route_estimated
            )
            VALUES ($1, $2, $3, $4, $5::text[], $6, 'Pending', $7, $8, $9, $10, $11, $12, $13)
            RETURNING *;
        `;
        const values = [
            data.requesterId,
            data.supplierId,
            data.deliveryLocation,
            data.neededByTime,
            data.itemLines,
            data.creditReward,
            data.deliveryLatitude,
            data.deliveryLongitude,
            data.route?.from.latitude ?? null,
            data.route?.from.longitude ?? null,
            data.route?.metres ?? null,
            data.route?.seconds ?? null,
            data.route?.estimated ?? null,
        ];
        const result: QueryResult<Order> = await pool.query(query, values);
        return result.rows[0];
    },

    async findOpenRequests(excludeRequesterId?: string): Promise<Order[]> {
        const result: QueryResult<Order> = await pool.query(
            `SELECT * FROM orders
            WHERE status = 'Open'
            AND needed_by_time > now()
            AND ($1::text IS NULL OR requester_id <> $1)
            ORDER BY created_at DESC;`,
            [excludeRequesterId ?? null],
        );
        return result.rows;
    },

    async findById(id: number): Promise<Order | null> {
        const result: QueryResult<Order> = await pool.query(`SELECT * FROM orders WHERE id = $1;`, [id]);
        return result.rows[0] || null;
    },

    // F3.3.6: oldest first, so the list reads as the errand's history.
    async findTransitions(orderId: number): Promise<OrderTransition[]> {
        const result: QueryResult<OrderTransition> = await pool.query(`
            SELECT from_status, to_status, actor, occurred_at FROM order_transitions
            WHERE order_id = $1 ORDER BY occurred_at, id;
        `, [orderId]);
        return result.rows;
    },

    // Pending and Rejected orders are not errands, see isErrand in the order service.
    async findByParticipant(accountId: string): Promise<OrderWithHistory[]> {
        const result: QueryResult<OrderWithHistory> = await pool.query(`
            SELECT o.*, COALESCE(t.transitions, '[]'::json) AS transitions
            FROM orders o
            LEFT JOIN LATERAL (
                SELECT json_agg(json_build_object(
                    'from_status', from_status, 'to_status', to_status,
                    'actor', actor, 'occurred_at', occurred_at
                ) ORDER BY occurred_at, id) AS transitions
                FROM order_transitions WHERE order_id = o.id
            ) t ON true
            WHERE (o.requester_id = $1 OR o.courier_id = $1) AND o.status NOT IN ('Pending', 'Rejected')
            ORDER BY o.created_at DESC, o.id DESC;
        `, [accountId]);
        return result.rows;
    },

    async findAllOrders(page: number, pageSize: number, q= '', status= ''): Promise<AdminOrders> {
        const offset = (page - 1) * pageSize

        const search = `%${q.trim()}%`

        const filters: string[] = []
        const values: unknown[] = []

        if (q.trim()) {
            values.push(search)
            filters.push(`
                (
                    delivery_location ILIKE $${values.length}
                    OR requester_id ILIKE $${values.length}
                    OR EXISTS (
                        SELECT 1
                        FROM unnest(item_lines) AS item
                        WHERE item ILIKE $${values.length}
                    )
                )
            `)
        }

        if (status) {
            values.push(status)
            filters.push(`status = $${values.length}`)
        }

        const whereClause = filters.length
            ? `WHERE ${filters.join(' AND ')}`
            : ''

        const paginationValues = [...values, pageSize, offset]

        const [orderResult, totalResult] = await Promise.all([
            pool.query<Order>(`
                SELECT *
                FROM orders
                ${whereClause}
                ORDER BY created_at DESC, id DESC
                LIMIT $${values.length + 1}
                OFFSET $${values.length + 2};
            `, paginationValues),

            pool.query<{ total: string }>(`
                SELECT COUNT(*) AS total
                FROM orders
                ${whereClause};
            `, values),
        ])

        return {
            orders: orderResult.rows,
            page,
            pageSize,
            total: Number(totalResult.rows[0].total),
        }
    },

    // The transition row is written in the same statement as the change, so a change
    // without its record (or the reverse) cannot happen.
    async acceptOrder(orderId: number, courierId: string): Promise<Order | null> {
        const query = `
            WITH updated AS (
                UPDATE orders
                SET courier_id = $1, status = 'Accepted', updated_at = now()
                WHERE id = $2 AND status = 'Open' AND requester_id != $1 AND needed_by_time > now()
                RETURNING *
            ), logged AS (
                INSERT INTO order_transitions (order_id, from_status, to_status, actor)
                SELECT id, 'Open', status, $1 FROM updated
            )
            SELECT * FROM updated;
        `;
        const result: QueryResult<Order> = await pool.query(query, [courierId, orderId]);
        return result.rows[0] || null;
    },

    async updateStatus(orderId: number, status: OrderStatus, expectedStatus: OrderStatus, actor: string): Promise<Order | null> {
        const query = `
            WITH updated AS (
                UPDATE orders
                SET status = $1, updated_at = now()
                WHERE id = $2 AND status = $3
                RETURNING *
            ), logged AS (
                INSERT INTO order_transitions (order_id, from_status, to_status, actor)
                SELECT id, $3, status, $4 FROM updated
            ), queued AS (
                INSERT INTO order_outbox (type, data)
                SELECT CASE status WHEN 'Rejected' THEN 'order.errand.cancelled' ELSE 'order.errand.' || lower(status) END,
                    jsonb_build_object(
                        'errandRef', id::text,
                        'courierId', courier_id,
                        'supplierId', supplier_id,
                        'deliverySupplierId', delivery_location,
                        'creditReward', credit_reward,
                        'itemCount', coalesce(array_length(item_lines, 1), 0),
                        'distance', route_metres,
                        'neededBy', needed_by_time,
                        'postedAt', created_at
                    )
                FROM updated WHERE status IN ('Completed', 'Cancelled', 'Expired', 'Rejected')
            )
            SELECT * FROM updated;
        `;
        const result: QueryResult<Order> = await pool.query(query, [status, orderId, expectedStatus, actor]);
        return result.rows[0] || null;
    }
};