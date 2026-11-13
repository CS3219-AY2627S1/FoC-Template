package sg.edu.nus.foc.order.application.recovery;

import java.time.Instant;

public final class CommandLease {
    private CommandLease() { }
    public static boolean eligible(String state, Instant nextRetry, Instant leaseExpiry, Instant now) {
        return "PENDING".equals(state) && !nextRetry.isAfter(now)
                && (leaseExpiry == null || !leaseExpiry.isAfter(now));
    }
}
