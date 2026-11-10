package sg.edu.nus.foc.order.infrastructure;

import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderStatus;

public interface JpaOrderRepository extends JpaRepository<Order, UUID>, JpaSpecificationExecutor<Order> {
    @Query(value = "select exists(select 1 from orders where status not in ('COMPLETED','CANCELLED','EXPIRED') "
            + "and (requester_id = :userId or courier_id = :userId))", nativeQuery = true)
    boolean existsNonTerminalUserInvolvement(@Param("userId") String userId);

    @Query(value = "select o.id from orders o where o.status='EXPIRED' and not o.completion_hold "
            + "and o.enabled and not o.used and o.due_at<=:now and o.repost_expires_at>:now "
            + "and o.reposted_order_id is null and not exists "
            + "(select 1 from order_commands c where c.actor_id=o.requester_id and c.order_id=o.id "
            + "and c.automatic_execution and not (c.status='COMPLETED' and c.outcome='REJECTED' "
            + "and c.final_stage_status='FULLY_COMPENSATED' and c.credit_step_status in ('FAILED','COMPENSATED') "
            + "and c.reason not in ('INSUFFICIENT_CREDITS','FORBIDDEN','ACCOUNT_NOT_FOUND',"
            + "'NOT_FOUND','VALIDATION_ERROR','REPOST_EXPIRED'))) "
            + "and not exists(select 1 from order_commands c where c.order_id=o.id and c.status='PENDING') "
            + "and not exists(select 1 from order_user_deletion_guards g where g.user_id=o.requester_id and g.blocked) "
            + "order by coalesce(o.repost_failure_at,o.due_at),o.due_at,o.id limit 100", nativeQuery = true)
    List<String> findDueAutomaticRepostIds(@Param("now") Instant now);

    @Query(value = "select exists(select 1 from orders where status in (:activeStatuses) "
            + "and (requester_id = :userId or courier_id = :userId))", nativeQuery = true)
    boolean existsActiveUserInvolvement(@Param("userId") String userId,
            @Param("activeStatuses") List<String> activeStatuses);

    @Query(value = "select exists(select 1 from orders where status in (:activeStatuses) "
            + "and (pickup_supplier_id = :supplierId or delivery_supplier_id = :supplierId))", nativeQuery = true)
    boolean existsActiveSupplierInvolvement(@Param("supplierId") String supplierId,
            @Param("activeStatuses") List<String> activeStatuses);

    @Query("select o from Order o where o.id = :id")
    Optional<Order> findById(@Param("id") String id);

    @Query(value = "select id as \"orderId\", cast(null as uuid) as \"attemptId\", created_at as \"visibleAt\" "
            + "from orders where courier_id = :courierId "
            + "union all select order_id as \"orderId\", id as \"attemptId\", aborted_at as \"visibleAt\" "
            + "from order_courier_attempts where courier_id = :courierId "
            + "order by \"visibleAt\" desc, \"orderId\", \"attemptId\"",
            countQuery = "select (select count(*) from orders where courier_id = :courierId) "
                    + "+ (select count(*) from order_courier_attempts where courier_id = :courierId)",
            nativeQuery = true)
    Page<CourierOrderReference> findCourierTimeline(@Param("courierId") String courierId, Pageable pageable);

    @Query(value = "select id as \"orderId\", cast(null as uuid) as \"attemptId\", created_at as \"visibleAt\" "
            + "from orders where courier_id = :courierId and status = :status "
            + "union all select order_id as \"orderId\", id as \"attemptId\", aborted_at as \"visibleAt\" "
            + "from order_courier_attempts where courier_id = :courierId and :status = 'ABORTED' "
            + "order by \"visibleAt\" desc, \"orderId\", \"attemptId\"",
            countQuery = "select (select count(*) from orders where courier_id = :courierId and status = :status) "
                    + "+ (select count(*) from order_courier_attempts where courier_id = :courierId and :status = 'ABORTED')",
            nativeQuery = true)
    Page<CourierOrderReference> findCourierTimelineByStatus(
            @Param("courierId") String courierId,
            @Param("status") String status,
            Pageable pageable);

    Page<Order> findByStatusAndExpiresAtAfterOrderByCreatedAtAsc(
            OrderStatus status,
            Instant now,
            Pageable pageable);

    @Query(value = "select o from Order o where o.requesterId = :requesterId "
            + "and (o.status <> sg.edu.nus.foc.order.domain.OrderStatus.EXPIRED "
            + "or o.repostedOrderId is null) order by o.createdAt desc",
            countQuery = "select count(o) from Order o where o.requesterId = :requesterId "
                    + "and (o.status <> sg.edu.nus.foc.order.domain.OrderStatus.EXPIRED "
                    + "or o.repostedOrderId is null)")
    Page<Order> findByRequesterIdOrderByCreatedAtDesc(
            @Param("requesterId") String requesterId,
            Pageable pageable);

    @Query(value = "select o from Order o where o.requesterId = :requesterId and o.status = :status "
            + "and (o.status <> sg.edu.nus.foc.order.domain.OrderStatus.EXPIRED "
            + "or o.repostedOrderId is null) order by o.createdAt desc",
            countQuery = "select count(o) from Order o where o.requesterId = :requesterId and o.status = :status "
                    + "and (o.status <> sg.edu.nus.foc.order.domain.OrderStatus.EXPIRED "
                    + "or o.repostedOrderId is null)")
    Page<Order> findRequesterOrdersByStatus(
            @Param("requesterId") String requesterId,
            @Param("status") OrderStatus status,
            Pageable pageable);

    @Query("select o from Order o where o.requesterId = :requesterId and o.status in :statuses order by o.createdAt desc, o.id desc")
    Page<Order> findActiveRequesterOrders(@Param("requesterId") String requesterId,
            @Param("statuses") List<OrderStatus> statuses, Pageable pageable);

    @Query("select o from Order o where (o.requesterId = :participantId or o.courierId = :participantId) and o.status in :statuses order by o.createdAt desc, o.id desc")
    Page<Order> findActiveParticipantOrders(@Param("participantId") String participantId,
            @Param("statuses") List<OrderStatus> statuses, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "0"))
    @Query("select o from Order o where o.id = :id and (o.requesterId = :participantId or o.courierId = :participantId) and o.status in :statuses")
    Optional<Order> findActiveParticipantOrderForUpdate(@Param("id") String id,
            @Param("participantId") String participantId, @Param("statuses") List<OrderStatus> statuses);

    @Query("select o from Order o where o.courierId = :courierId and o.status in :statuses order by o.createdAt desc, o.id desc")
    Page<Order> findActiveAssignedOrders(@Param("courierId") String courierId,
            @Param("statuses") List<OrderStatus> statuses, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "0"))
    @Query("select o from Order o where o.id = :id and o.courierId = :courierId and o.status in :statuses")
    Optional<Order> findActiveAssignedOrderForUpdate(@Param("id") String id,
            @Param("courierId") String courierId, @Param("statuses") List<OrderStatus> statuses);

    @Query("select o from Order o where o.status = :status "
            + "and (o.requesterId = :userId or o.courierId = :userId) order by o.createdAt desc, o.id desc")
    Page<Order> findCreditHistoryInvolving(@Param("userId") String userId, @Param("status") OrderStatus status, Pageable pageable);

    @Query("select o from Order o where o.id = :id and o.status = :status "
            + "and (o.requesterId = :userId or o.courierId = :userId)")
    Optional<Order> findCreditHistoryInvolving(@Param("id") String id, @Param("userId") String userId, @Param("status") OrderStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "0"))
    @Query("select o from Order o where o.id = :id and o.requesterId = :requesterId and o.status in :statuses")
    Optional<Order> findActiveRequesterOrderForUpdate(@Param("id") String id,
            @Param("requesterId") String requesterId, @Param("statuses") List<OrderStatus> statuses);

    Page<Order> findByCourierIdOrderByCreatedAtDesc(String courierId, Pageable pageable);

    Page<Order> findByStatusOrderByCreatedAtDesc(OrderStatus status, Pageable pageable);

    @Query("select o.id from Order o where o.status = :status "
            + "and o.completionHold = false and o.expiresAt <= :now and o.courierId is null order by o.createdAt, o.id")
    List<String> findDueUnassignedIds(@Param("status") OrderStatus status, @Param("now") Instant now);

    @Query("select o.id from Order o where o.status = :status "
            + "and o.completionHold = false "
            + "and o.deliveryDeadlineAt is not null and o.deliveredAt <= :deliveredAtOrBefore "
            + "order by o.createdAt, o.id")
    List<String> findDueForAutoCompletionIds(
            @Param("status") OrderStatus status,
            @Param("deliveredAtOrBefore") Instant deliveredAtOrBefore);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<Order> findByStatusAndExpiresAtLessThanEqualAndCourierIdIsNull(
            OrderStatus status,
            Instant now);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "0"))
    @Query("select o from Order o where o.status = :status "
            + "and o.completionHold = false "
            + "and o.deliveryDeadlineAt is not null and o.deliveredAt <= :deliveredAtOrBefore")
    List<Order> findDueForAutoCompletion(
            @Param("status") OrderStatus status,
            @Param("deliveredAtOrBefore") Instant deliveredAtOrBefore);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Order o where o.id = :id")
    Optional<Order> findByIdForUpdate(@Param("id") String id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "0"))
    @Query("select o from Order o where o.id = :id")
    Optional<Order> findByIdForLifecycleUpdate(@Param("id") String id);
}
