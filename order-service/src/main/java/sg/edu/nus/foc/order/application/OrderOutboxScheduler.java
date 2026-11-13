package sg.edu.nus.foc.order.application;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class OrderOutboxScheduler {
    private final OrderOutboxDispatcher dispatcher;

    @Scheduled(cron = "${order.messaging.outbox.recovery-cron:0 */15 * * * *}")
    public void dispatchDueEvents() {
        try {
            dispatcher.dispatchDueBatch();
        } catch (RuntimeException exception) {
            log.error("Order outbox recovery pass failed; the next cron pass will retry.", exception);
        }
    }
}
