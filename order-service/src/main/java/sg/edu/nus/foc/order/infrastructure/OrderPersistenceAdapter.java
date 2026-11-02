package sg.edu.nus.foc.order.infrastructure;

import java.time.Instant;
import java.util.List;
import java.util.ArrayList;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCourierAttempt;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.OrderPage;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

@Repository
@RequiredArgsConstructor
public class OrderPersistenceAdapter implements OrderRepository {
    private static final List<String> ACTIVE_STATUSES = List.of(
            OrderStatus.OPEN.name(), OrderStatus.ACCEPTED.name(), OrderStatus.IN_PROGRESS.name(),
            OrderStatus.PICKED_UP.name(), OrderStatus.DELIVERED.name());
    private static final List<OrderStatus> REPORTABLE_STATUSES = List.of(
            OrderStatus.ACCEPTED, OrderStatus.IN_PROGRESS, OrderStatus.PICKED_UP, OrderStatus.DELIVERED);

    private final JpaOrderRepository repository;
    private final JpaOrderCourierAttemptRepository attempts;
    private final sg.edu.nus.foc.order.domain.repository.UserDeletionGuard deletionGuard;
    private sg.edu.nus.foc.order.application.recovery.OrderCommandStore commands;

    @org.springframework.beans.factory.annotation.Autowired
    public void setCommandStore(sg.edu.nus.foc.order.application.recovery.OrderCommandStore commands) {
        this.commands = commands;
    }

    @Override
    public List<String> findDueAutomaticRepostIds(Instant now) {
        return repository.findDueAutomaticRepostIds(now);
    }

    @Override
    public boolean hasNonTerminalUserInvolvement(String userId) {
        return repository.existsNonTerminalUserInvolvement(userId);
    }

    @Override
    public boolean hasActiveUserInvolvement(String userId) {
        return repository.existsActiveUserInvolvement(userId, ACTIVE_STATUSES);
    }

    @Override
    public boolean hasActiveSupplierInvolvement(String supplierId) {
        return repository.existsActiveSupplierInvolvement(supplierId, ACTIVE_STATUSES);
    }

    @Override
    public Optional<Order> get(String id) {
        return repository.findById(id);
    }

    @Override
    public Optional<Order> getForUpdate(String id) {
        Optional<Order> locked = repository.findByIdForUpdate(id);
        if (commands != null) commands.guard(id);
        return locked;
    }

    @Override
    public Optional<Order> getActiveForReportHoldUpdate(String id, String requesterId) {
        Optional<Order> locked = repository.findActiveRequesterOrderForUpdate(id, requesterId,
                REPORTABLE_STATUSES);
        if (locked.isPresent() && commands != null) commands.guard(id);
        return locked;
    }

    @Override
    @Transactional(readOnly = true)
    public OrderPage findActiveRequestedBy(String requesterId, int page, int size) {
        return toOrderPage(repository.findActiveRequesterOrders(requesterId,
                REPORTABLE_STATUSES, pageRequest(page, size)));
    }

    @Override
    public Optional<Order> getActiveCourierReportHoldUpdate(String id, String courierId) {
        Optional<Order> locked = repository.findActiveAssignedOrderForUpdate(id, courierId, REPORTABLE_STATUSES);
        if (locked.isPresent() && commands != null) commands.guard(id);
        return locked;
    }

    @Override
    @Transactional(readOnly = true)
    public OrderPage findActiveAssignedTo(String courierId, int page, int size) {
        return toOrderPage(repository.findActiveAssignedOrders(courierId, REPORTABLE_STATUSES, pageRequest(page, size)));
    }

    @Override
    @Transactional(readOnly = true)
    public OrderPage findActiveInvolving(String participantId, int page, int size) {
        return toOrderPage(repository.findActiveParticipantOrders(participantId, REPORTABLE_STATUSES, pageRequest(page, size)));
    }

    @Override
    public Optional<Order> getActiveParticipantReportHoldUpdate(String id, String participantId) {
        Optional<Order> locked = repository.findActiveParticipantOrderForUpdate(id, participantId, REPORTABLE_STATUSES);
        if (locked.isPresent() && commands != null) commands.guard(id);
        return locked;
    }

    @Override
    @Transactional(readOnly = true)
    public OrderPage findCreditHistoryInvolving(String userId, OrderStatus status, int page, int size) {
        return toOrderPage(repository.findCreditHistoryInvolving(userId, status, pageRequest(page, size)));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Order> getCreditHistoryInvolving(String id, String userId, OrderStatus status) {
        return repository.findCreditHistoryInvolving(id, userId, status);
    }

    @Override
    public Optional<Order> getForLifecycleUpdate(String id) {
        Optional<Order> locked = repository.findByIdForLifecycleUpdate(id);
        if (commands != null) commands.guard(id);
        return locked;
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> findDueUnassignedIds(OrderStatus status, Instant now) {
        return repository.findDueUnassignedIds(status, now);
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> findDueForAutoCompletionIds(Instant deliveredAtOrBefore) {
        return repository.findDueForAutoCompletionIds(OrderStatus.DELIVERED, deliveredAtOrBefore);
    }

    @Override
    @Transactional
    public Order save(Order order) {
        if (order.getAttemptId() != null) {
            throw new IllegalArgumentException("Courier history cannot be saved as a current Order.");
        }
        if (order.getStatus() != OrderStatus.COMPLETED && order.getStatus() != OrderStatus.CANCELLED
                && order.getStatus() != OrderStatus.EXPIRED) {
            deletionGuard.requireAllowed(order.getRequesterId(), order.getCourierId());
        }
        return repository.save(order);
    }

    @Override
    public void saveAbortedAttempt(OrderCourierAttempt attempt) {
        attempts.save(attempt);
    }

    @Override
    public OrderPage findAvailable(Instant now, int page, int size) {
        Page<Order> result = repository.findByStatusAndExpiresAtAfterOrderByCreatedAtAsc(
                OrderStatus.OPEN,
                now,
                pageRequest(page, size));
        return toOrderPage(result);
    }

    @Override
    public OrderPage findRequestedBy(String requesterId, int page, int size) {
        Page<Order> result = repository.findByRequesterIdOrderByCreatedAtDesc(
                requesterId,
                pageRequest(page, size));
        return toOrderPage(result);
    }

    @Override
    public OrderPage findRequestedBy(String requesterId, OrderStatus status, int page, int size) {
        if (status == null) {
            return findRequestedBy(requesterId, page, size);
        }
        return toOrderPage(repository.findRequesterOrdersByStatus(requesterId, status, pageRequest(page, size)));
    }

    @Override
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public OrderPage findCourierOrders(String courierId, int page, int size) {
        return findCourierOrders(courierId, null, page, size);
    }

    @Override
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public OrderPage findCourierOrders(String courierId, OrderStatus status, int page, int size) {
        PageRequest pageable = pageRequest(page, size);
        Page<CourierOrderReference> result = status == null
                ? repository.findCourierTimeline(courierId, pageable)
                : repository.findCourierTimelineByStatus(courierId, status.name(), pageable);
        List<Order> items = result.getContent().stream()
                .map(reference -> reference.getAttemptId() == null
                        ? repository.findById(reference.getOrderId()).orElseThrow()
                        : Order.historicalAttempt(attempts.findById(reference.getAttemptId()).orElseThrow()))
                .toList();
        return new OrderPage(items, result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
    }

    @Override
    public OrderPage findAllOrders(OrderStatus status, int page, int size) {
        PageRequest pageable = PageRequest.of(
                Math.max(page, 0),
                Math.min(Math.max(size, 1), 100),
                Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Order> result = status == null
                ? repository.findAll(pageable)
                : repository.findByStatusOrderByCreatedAtDesc(status, pageable);
        return toOrderPage(result);
    }

    @Override
    public OrderPage findAllOrders(OrderStatus status, String orderId, Instant createdFrom, Instant createdBefore, int page, int size) {
        return findAllOrders(status, orderId, createdFrom, createdBefore, false, page, size);
    }

    @Override
    public OrderPage findAllOrders(OrderStatus status, String orderId, Instant createdFrom, Instant createdBefore,
                                   boolean actionEligibleOnly, int page, int size) {
        Specification<Order> filter = (root, query, criteria) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (actionEligibleOnly) predicates.add(root.get("status").in(
                    ACTIVE_STATUSES.stream().map(OrderStatus::valueOf).toList()));
            if (status != null) predicates.add(criteria.equal(root.get("status"), status));
            if (orderId != null) predicates.add(criteria.equal(root.get("id"), orderId));
            if (createdFrom != null) predicates.add(criteria.greaterThanOrEqualTo(root.get("createdAt"), createdFrom));
            if (createdBefore != null) predicates.add(criteria.lessThan(root.get("createdAt"), createdBefore));
            return criteria.and(predicates.toArray(Predicate[]::new));
        };
        PageRequest pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100),
                Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by("id")));
        return toOrderPage(repository.findAll(filter, pageable));
    }

    @Override
    public List<Order> findDueUnassigned(OrderStatus status, Instant now) {
        return repository.findByStatusAndExpiresAtLessThanEqualAndCourierIdIsNull(status, now);
    }

    @Override
    public List<Order> findDueForAutoCompletion(Instant deliveredAtOrBefore) {
        return repository.findDueForAutoCompletion(OrderStatus.DELIVERED, deliveredAtOrBefore);
    }

    private PageRequest pageRequest(int page, int size) {
        int pageNumber = Math.max(page, 0);
        int pageSize = Math.min(Math.max(size, 1), 100);
        return PageRequest.of(pageNumber, pageSize);
    }

    private OrderPage toOrderPage(Page<Order> result) {
        return new OrderPage(
                result.getContent(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements(),
                result.getTotalPages());
    }
}
