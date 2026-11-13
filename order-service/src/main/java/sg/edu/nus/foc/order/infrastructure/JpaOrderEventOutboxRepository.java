package sg.edu.nus.foc.order.infrastructure;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import sg.edu.nus.foc.order.domain.OrderEventOutbox;

@Repository
public interface JpaOrderEventOutboxRepository extends JpaRepository<OrderEventOutbox, String> {
    @Query(value = "select * from order_event_outbox where event_id=:eventId for update", nativeQuery = true)
    Optional<OrderEventOutbox> findForRedrive(@Param("eventId") String eventId);

    @Query(value = "select event_id from order_event_outbox where state='FAILED' order by created_at,event_id limit :limit", nativeQuery = true)
    List<String> findFailedIds(@Param("limit") int limit);

    @Query(value = """
            select event_id from order_event_outbox
            where (state = 'PENDING' and next_attempt_at <= :now)
               or (state = 'IN_PROGRESS' and lease_until <= :now)
            order by created_at, event_id
            limit :limit
            """, nativeQuery = true)
    List<String> findDueIds(@Param("now") Instant now, @Param("limit") int limit);

    @Query(value = """
            select * from order_event_outbox
            where event_id = :eventId
              and ((state = 'PENDING' and next_attempt_at <= :now)
                or (state = 'IN_PROGRESS' and lease_until <= :now))
            for update skip locked
            """, nativeQuery = true)
    Optional<OrderEventOutbox> findClaimableByIdForUpdate(
            @Param("eventId") String eventId,
            @Param("now") Instant now);

    @Query(value = """
            select * from order_event_outbox
            where (state = 'PENDING' and next_attempt_at <= :now)
               or (state = 'IN_PROGRESS' and lease_until <= :now)
            order by created_at, event_id
            limit :limit
            for update skip locked
            """, nativeQuery = true)
    List<OrderEventOutbox> findDueForUpdate(
            @Param("now") Instant now,
            @Param("limit") int limit);
}
