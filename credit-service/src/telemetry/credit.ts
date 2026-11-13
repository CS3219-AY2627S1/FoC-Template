import { meter } from "./instruments.ts";
import { SnapshotMonitor, type SnapshotMonitorOptions } from "./snapshot.ts";

export interface CreditSnapshot {
    available: number;
    held: number;
    holds: number;
}

/** current stored balances and active holds */
export class CreditMetricsMonitor extends SnapshotMonitor<CreditSnapshot> {
    constructor(read: () => Promise<CreditSnapshot>, options: SnapshotMonitorOptions = {}) {
        super("campusgo.credit", read, snapshot =>
            [snapshot.available, snapshot.held, snapshot.available + snapshot.held].every(Number.isSafeInteger) &&
            Number.isSafeInteger(snapshot.holds) && snapshot.holds >= 0, options);
        for (const field of ["available", "held", "holds"] as const) {
            this.observe(meter.createObservableGauge(`campusgo.credit.${field}`), result => {
                const snapshot = this.getFreshSnapshot();
                if (snapshot)
                    result.observe(snapshot[field]);
            });
        }
        this.observe(meter.createObservableGauge("campusgo.credit.circulation"), result => {
            const snapshot = this.getFreshSnapshot();
            if (snapshot)
                result.observe(snapshot.available + snapshot.held);
        });
    }
}
