package sg.edu.nus.foc.credit.messaging;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.credit.credit.CreditOutcomeEvent;
import sg.edu.nus.foc.credit.credit.CreditOutcomeType;

class CreditOrderEventHandlersTest {

    @Test
    void twoHandlersMapCompactMessagesToTheirFixedOutcomeTypes() {
        AtomicReference<CreditOutcomeEvent> processed = new AtomicReference<>();
        new CreditOpenOrderRefundEventHandler(processed::set).handle(
                message("OpenOrderRefundTaskEvent", "CANCELLED", null));
        assertThat(processed.get().type()).isEqualTo(CreditOutcomeType.OPEN_ORDER_REFUND);
        assertThat(processed.get().creditAmount()).isEqualTo(10);

        new CreditOrderCompletionEventHandler(processed::set).handle(
                message("OrderCompletionTaskEvent", "COMPLETED", "courier-1"));
        assertThat(processed.get().type()).isEqualTo(CreditOutcomeType.ORDER_COMPLETION);
        assertThat(processed.get().courierId()).isEqualTo("courier-1");
    }

    private static OrderEventMessage message(String eventType, String status, String courierId) {
        return new OrderEventMessage("event-1", eventType, "order-1", status, 10,
                Instant.parse("2026-10-08T08:00:00Z"), courierId);
    }
}
