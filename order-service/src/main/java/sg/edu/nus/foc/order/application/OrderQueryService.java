package sg.edu.nus.foc.order.application;

import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.OrderPage;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

@Service
@RequiredArgsConstructor
public class OrderQueryService {
    private final OrderRepository orders;

    public Order get(String id) {
        return orders.get(id)
                .orElseThrow(() -> OrderProblem.notFound("Order not found."));
    }

    public OrderPage requestedActiveBy(String requesterId, int page, int size) {
        if (page < 1 || size < 1 || size > 100) {
            throw new OrderProblem("VALIDATION_ERROR", "Page must be at least 1 and size must be between 1 and 100.");
        }
        return orders.findActiveRequestedBy(requesterId, page - 1, size);
    }

    public OrderPage participantActive(String participantId, int page, int size) {
        if (page < 1 || size < 1 || size > 100) {
            throw new OrderProblem("VALIDATION_ERROR", "Page must be at least 1 and size must be between 1 and 100.");
        }
        return orders.findActiveInvolving(participantId, page - 1, size);
    }

    public OrderPage assignedActiveTo(String courierId, int page, int size) {
        if (page < 1 || size < 1 || size > 100) {
            throw new OrderProblem("VALIDATION_ERROR", "Page must be at least 1 and size must be between 1 and 100.");
        }
        return orders.findActiveAssignedTo(courierId, page - 1, size);
    }

    public OrderPage available(int page, int size) {
        return orders.findAvailable(Instant.now(), page, size);
    }

    public OrderPage requestedBy(String requesterId, int page, int size) {
        return orders.findRequestedBy(requesterId, page, size);
    }

    public OrderPage completedInvolving(String userId, int page, int size) {
        return historyInvolving(userId, OrderStatus.COMPLETED, page, size);
    }

    public Order completedInvolving(String id, String userId) {
        return orders.getCreditHistoryInvolving(id, userId, OrderStatus.COMPLETED)
                .orElseThrow(() -> OrderProblem.notFound("Completed order not found."));
    }

    public OrderPage cancelledInvolving(String userId, int page, int size) {
        return historyInvolving(userId, OrderStatus.CANCELLED, page, size);
    }

    public Order cancelledInvolving(String id, String userId) {
        return orders.getCreditHistoryInvolving(id, userId, OrderStatus.CANCELLED)
                .orElseThrow(() -> OrderProblem.notFound("Cancelled order not found."));
    }

    private OrderPage historyInvolving(String userId, OrderStatus status, int page, int size) {
        if (page < 1 || size < 1 || size > 100) {
            throw new OrderProblem("VALIDATION_ERROR", "Page must be >=1 and size 1..100.");
        }
        return orders.findCreditHistoryInvolving(userId, status, page - 1, size);
    }

    public OrderPage courierFor(String courierId, int page, int size) {
        return orders.findCourierOrders(courierId, page, size);
    }

    public OrderPage requestedBy(String requesterId, OrderStatus status, int page, int size) {
        return orders.findRequestedBy(requesterId, status, page, size);
    }

    public OrderPage courierFor(String courierId, OrderStatus status, int page, int size) {
        return orders.findCourierOrders(courierId, status, page, size);
    }

    public OrderPage allOrders(OrderStatus status, int page, int size) {
        return orders.findAllOrders(status, page, size);
    }

    public OrderPage allOrders(OrderStatus status, String orderId, Instant createdFrom, Instant createdBefore, int page, int size) {
        return allOrders(status, orderId, createdFrom, createdBefore, false, page, size);
    }

    public OrderPage allOrders(OrderStatus status, String orderId, Instant createdFrom, Instant createdBefore,
                               boolean actionEligibleOnly, int page, int size) {
        validateCreatedRange(createdFrom, createdBefore);
        if (orderId != null && orderId.length() > 128) {
            throw new OrderProblem("VALIDATION_ERROR", "Order ID must not exceed 128 characters.");
        }
        String normalizedId = orderId == null || orderId.isBlank() ? null : orderId.strip();
        if (actionEligibleOnly) {
            return orders.findAllOrders(status, normalizedId, createdFrom, createdBefore, true, page, size);
        }
        return orders.findAllOrders(status, normalizedId,
                createdFrom, createdBefore, page, size);
    }

    public static void validateCreatedRange(Instant from, Instant before) {
        if (from != null && before != null && !from.isBefore(before)) {
            throw new OrderProblem("VALIDATION_ERROR", "createdFrom must be before createdBefore.");
        }
    }
}
