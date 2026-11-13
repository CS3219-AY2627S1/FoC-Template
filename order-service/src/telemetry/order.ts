import type { OrderStatus } from "../prisma/orders.ts";
import { meter } from "./instruments.ts";
import { SnapshotMonitor, type SnapshotMonitorOptions } from "./snapshot.ts";

export const orderStatuses = ["PENDING", "REJECTED", "OPEN", "ACCEPTED", "COLLECTED", "DELIVERED", "CANCELLED", "EXPIRED"] as const satisfies readonly OrderStatus[];
export const activeOrderStatuses = ["OPEN", "ACCEPTED", "COLLECTED"] as const;
export const overdueOrderStatuses = ["PENDING", ...activeOrderStatuses] as const;

export interface OrderSnapshot {
    counts: Record<OrderStatus, number>;
    overdue: Record<typeof overdueOrderStatuses[number], number>;
    oldestPendingAge: number;
    oldestActiveAge: number;
}

/** status/deadline observations */
export class OrderMetricsMonitor extends SnapshotMonitor<OrderSnapshot> {
    constructor(read: () => Promise<OrderSnapshot>, options: SnapshotMonitorOptions = {}) {
        super("campusgo.order", read, snapshot =>
            orderStatuses.every(status => Number.isSafeInteger(snapshot.counts[status]) && snapshot.counts[status] >= 0) &&
            overdueOrderStatuses.every(status => Number.isSafeInteger(snapshot.overdue[status]) &&
                snapshot.overdue[status] >= 0 && snapshot.overdue[status] <= snapshot.counts[status]) &&
            [snapshot.oldestPendingAge, snapshot.oldestActiveAge].every(value => Number.isFinite(value) && value >= 0), options);
        this.observe(meter.createObservableGauge("campusgo.order.orders"), result => {
            const snapshot = this.getFreshSnapshot();
            if (snapshot) {
                for (const status of orderStatuses)
                    result.observe(snapshot.counts[status], { status });
            }
        });
        this.observe(meter.createObservableGauge("campusgo.order.overdue"), result => {
            const snapshot = this.getFreshSnapshot();
            if (snapshot) {
                for (const status of overdueOrderStatuses)
                    result.observe(snapshot.overdue[status], { status });
            }
        });
        this.observe(meter.createObservableGauge("campusgo.order.oldest_pending.age", { unit: "s" }), result => {
            const snapshot = this.getFreshSnapshot();
            if (snapshot)
                result.observe(snapshot.counts.PENDING ? snapshot.oldestPendingAge + Math.max(0, this.now() - this.lastSuccessMs) / 1000 : 0);
        });
        this.observe(meter.createObservableGauge("campusgo.order.oldest_active.age", { unit: "s" }), result => {
            const snapshot = this.getFreshSnapshot();
            if (snapshot) {
                const active = activeOrderStatuses.some(status => snapshot.counts[status] > 0);
                result.observe(active ? snapshot.oldestActiveAge + Math.max(0, this.now() - this.lastSuccessMs) / 1000 : 0);
            }
        });
    }
}
