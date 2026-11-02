package sg.edu.nus.foc.order.domain.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCourierAttempt;
import sg.edu.nus.foc.order.domain.OrderStatus;

public interface OrderRepository {
    boolean hasNonTerminalUserInvolvement(String userId);
    List<String> findDueAutomaticRepostIds(Instant now);

    boolean hasActiveUserInvolvement(String userId);

    boolean hasActiveSupplierInvolvement(String supplierId);

    Optional<Order> get(String id);

    Optional<Order> getForUpdate(String id);

    Optional<Order> getActiveForReportHoldUpdate(String id, String requesterId);

    OrderPage findActiveRequestedBy(String requesterId, int page, int size);

    Optional<Order> getActiveCourierReportHoldUpdate(String id, String courierId);

    OrderPage findActiveAssignedTo(String courierId, int page, int size);

    OrderPage findActiveInvolving(String participantId, int page, int size);

    Optional<Order> getActiveParticipantReportHoldUpdate(String id, String participantId);

    OrderPage findCreditHistoryInvolving(String userId, OrderStatus status, int page, int size);

    Optional<Order> getCreditHistoryInvolving(String id, String userId, OrderStatus status);

    Optional<Order> getForLifecycleUpdate(String id);

    Order save(Order order);

    void saveAbortedAttempt(OrderCourierAttempt attempt);

    OrderPage findAvailable(Instant now, int page, int size);

    OrderPage findRequestedBy(String requesterId, int page, int size);

    OrderPage findRequestedBy(String requesterId, OrderStatus status, int page, int size);

    OrderPage findCourierOrders(String courierId, int page, int size);

    OrderPage findCourierOrders(String courierId, OrderStatus status, int page, int size);

    OrderPage findAllOrders(OrderStatus status, int page, int size);

    OrderPage findAllOrders(OrderStatus status, String orderId, Instant createdFrom, Instant createdBefore, int page, int size);

    OrderPage findAllOrders(OrderStatus status, String orderId, Instant createdFrom, Instant createdBefore,
                           boolean actionEligibleOnly, int page, int size);

    List<Order> findDueUnassigned(OrderStatus status, Instant now);

    List<String> findDueUnassignedIds(OrderStatus status, Instant now);

    List<String> findDueForAutoCompletionIds(Instant deliveredAtOrBefore);

    List<Order> findDueForAutoCompletion(Instant deliveredAtOrBefore);
}
