package sg.edu.nus.foc.order.application;

import java.time.Instant;
import java.util.List;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

@Service
@RequiredArgsConstructor
@Slf4j
public class LifecycleProcessingService {

    private final OrderRepository orders;
    private final OrderExpiryProcessingService expiry;
    private final OrderRepostService reposts;
    private final OrderAuditLogger audit;
    private final OrderTransitionService transitions;
    @org.springframework.beans.factory.annotation.Autowired
    private org.springframework.beans.factory.ObjectProvider<sg.edu.nus.foc.order.application.recovery.OrderCommandService> automaticCommands;
    @org.springframework.beans.factory.annotation.Value("${order.lifecycle.automatic-repost-enabled:false}")
    private boolean automaticRepostEnabled;

    public int autoCompleteDue(Instant now) {
        Instant deliveredAtOrBefore = now.minus(Order.AUTOMATIC_COMPLETION_DELAY);
        List<String> dueOrderIds = orders.findDueForAutoCompletionIds(deliveredAtOrBefore);
        int completedCount = 0;
        for (String orderId : dueOrderIds) {
            try {
                if (transitions.autoComplete(orderId, now)) {
                    completedCount++;
                }
            } catch (RuntimeException exception) {
                log.error("Automatic completion failed for order {}; continuing with remaining orders.",
                        orderId, exception);
            }
        }
        return completedCount;
    }

    public int expireDue(Instant now) {
        List<String> dueOrderIds = orders.findDueUnassignedIds(OrderStatus.OPEN, now);
        int expiredCount = 0;
        for (String orderId : dueOrderIds) {
            try {
                if (expiry.expire(orderId, now)) {
                    expiredCount++;
                }
            } catch (RuntimeException exception) {
                log.error("Expiry failed for order {}; continuing with remaining orders.", orderId, exception);
            }
        }
        return expiredCount;
    }

    public int repostDue(Instant now, String lifecycleAuthorization) {
        if (!automaticRepostEnabled) return 0;
        int repostedCount = 0;
        // Select IDs without row locks; every registration/finalization rechecks under its own lock.
        for (String orderId : orders.findDueAutomaticRepostIds(now)) {
            try {
                sg.edu.nus.foc.order.application.recovery.CommandView result =
                        automaticCommands.getObject().submitAutomatic(orderId, now);
                if ("SUCCESS".equals(result.outcome())) repostedCount++;
            } catch (RuntimeException failure) {
                log.error("Automatic repost failed for order {}; continuing with remaining orders.", orderId, failure);
            }
        }
        return repostedCount;
    }
}
