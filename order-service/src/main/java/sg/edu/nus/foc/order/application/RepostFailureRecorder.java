package sg.edu.nus.foc.order.application;

import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

/** Writes only a safe outcome, after the business attempt's transaction rolled back. */
@Service
@RequiredArgsConstructor
public class RepostFailureRecorder {
    private final OrderRepository orders;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String orderId, String code, Instant occurredAt) {
        Order order = orders.getForUpdate(orderId).orElse(null);
        if (order == null || order.getStatus() != OrderStatus.EXPIRED || order.getRepostedOrderId() != null) {
            return;
        }
        order.recordRepostFailure(code, message(code), occurredAt);
        orders.save(order);
    }

    private String message(String code) {
        return switch (code) {
            case "INSUFFICIENT_CREDITS" -> "Repost failed: insufficient available credits.";
            case "FORBIDDEN", "UNAUTHENTICATED" -> "Repost could not be authorized. Please sign in again.";
            case "VALIDATION_ERROR" -> "Repost failed: check the request details.";
            case "REPOST_EXPIRED" -> "Repost expired before it could be posted.";
            case "CONFLICT" -> "This request could not be reposted. Refresh and check its status.";
            case "NOT_FOUND" -> "Repost failed: a required account or location is unavailable.";
            default -> "Could not repost right now. Please try again later.";
        };
    }
}
