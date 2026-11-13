package sg.edu.nus.foc.order.domain;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CommandReceiptBindingTest {
    @Test void aReplayMustMatchOrderActorAndImmutableInput() {
        String input = CommandReceipt.fingerprint("CANCEL", "order", "actor", 3L);
        CommandReceipt receipt = new CommandReceipt("CANCEL", "key", "order", Instant.now()).bind("actor", input);
        assertDoesNotThrow(() -> receipt.requireBinding("order", "actor", input));
        assertThrows(OrderProblem.class, () -> receipt.requireBinding("other", "actor", input));
        assertThrows(OrderProblem.class, () -> receipt.requireBinding("order", "other", input));
        assertThrows(OrderProblem.class, () -> receipt.requireBinding("order", "actor", CommandReceipt.fingerprint("CANCEL", "order", "actor", 4L)));
        assertThrows(OrderProblem.class, () -> new CommandReceipt("CANCEL", "old", "order", Instant.now())
                .requireBinding("order", "actor", input));
        assertNotEquals(CommandReceipt.fingerprint("a:b", "c"), CommandReceipt.fingerprint("a", "b:c"));
        assertNotEquals(CommandReceipt.fingerprint((Object) null), CommandReceipt.fingerprint("null"));
    }
}
