package sg.edu.nus.foc.order.domain.repository;

import java.util.Optional;

import sg.edu.nus.foc.order.domain.OrderCompletionHold;

public interface OrderCompletionHoldRepository {

    Optional<OrderCompletionHold> findByReportId(String reportId);

    /** Insert-only placement: an existing report ID must never be rebound by an update. */
    void save(OrderCompletionHold hold);

    void release(OrderCompletionHold hold);

    boolean hasActiveForOrder(String orderId);
}
