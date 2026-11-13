package sg.edu.nus.foc.credit.messaging;

import org.springframework.stereotype.Component;
import sg.edu.nus.foc.credit.credit.CreditOutcomeProcessor;
import sg.edu.nus.foc.credit.credit.CreditOutcomeType;

@Component
public class CreditOpenOrderRefundEventHandler implements OpenOrderRefundEventHandler {

    private final CreditOutcomeProcessor processor;

    public CreditOpenOrderRefundEventHandler(CreditOutcomeProcessor processor) {
        this.processor = processor;
    }

    @Override
    public void handle(OrderEventMessage message) {
        processor.processOutcome(CreditOutcomeEventMapper.map(
                message, CreditOutcomeType.OPEN_ORDER_REFUND));
    }
}
