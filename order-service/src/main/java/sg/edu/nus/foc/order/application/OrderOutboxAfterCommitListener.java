package sg.edu.nus.foc.order.application;

import java.util.concurrent.Executor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@Slf4j
public class OrderOutboxAfterCommitListener {
    private final OrderOutboxDispatcher dispatcher;
    private final Executor executor;

    public OrderOutboxAfterCommitListener(OrderOutboxDispatcher dispatcher) {
        this(dispatcher, Runnable::run);
    }

    @Autowired
    public OrderOutboxAfterCommitListener(OrderOutboxDispatcher dispatcher,
            @Qualifier("orderOutboxExecutor") Executor executor) {
        this.dispatcher = dispatcher;
        this.executor = executor;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void dispatchAfterCommit(OrderOutboxDispatchRequested request) {
        try {
            executor.execute(() -> publish(request));
        } catch (RuntimeException exception) {
            log.warn("Immediate dispatch queue unavailable for {}; durable recovery will pick it up.",
                    request.eventId(), exception);
        }
    }

    private void publish(OrderOutboxDispatchRequested request) {
        try {
            dispatcher.dispatch(request.eventId());
        } catch (RuntimeException exception) {
            log.error("Order event {} could not be dispatched after commit; cron recovery will retry it.",
                    request.eventId(), exception);
        }
    }
}
