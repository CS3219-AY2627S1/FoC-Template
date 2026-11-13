package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.order.application.recovery.CommandLease;

/** ADR-033 / F13: retry timing never steals an active foreground claim. */
class CommandLeaseTest {
    private final Instant now = Instant.parse("2026-10-10T02:00:00Z");

    @Test void pendingIsNotClaimableWhileItsLeaseIsActive() {
        assertFalse(CommandLease.eligible("PENDING", now, now.plusSeconds(60), now));
        assertTrue(CommandLease.eligible("PENDING", now, now, now));
        assertTrue(CommandLease.eligible("PENDING", now.minusSeconds(1), null, now));
    }

    @Test void futureRetryAndTerminalCommandsAreNotClaimable() {
        assertFalse(CommandLease.eligible("PENDING", now.plusSeconds(1), null, now));
        assertFalse(CommandLease.eligible("COMPLETED", now, null, now));
    }
}
