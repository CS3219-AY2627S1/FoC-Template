package sg.edu.nus.foc.credit.messaging;

import sg.edu.nus.foc.credit.credit.CreditOutcomeEvent;
import sg.edu.nus.foc.credit.credit.CreditOutcomeType;

final class CreditOutcomeEventMapper {

    private CreditOutcomeEventMapper() {
    }

    static CreditOutcomeEvent map(OrderEventMessage message, CreditOutcomeType type) {
        return new CreditOutcomeEvent(
                message.eventId(), type, message.orderId(), message.orderStatus(),
                message.creditAmount(), message.occurredAt(), message.courierId());
    }
}
