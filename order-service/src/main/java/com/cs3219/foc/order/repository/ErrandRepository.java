package com.cs3219.foc.order.repository;

import com.cs3219.foc.order.model.entity.Errand;
import com.cs3219.foc.order.model.entity.ErrandStatus;
import jakarta.persistence.LockModeType;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface ErrandRepository extends JpaRepository<Errand, UUID> {
    Optional<Errand> findByRequesterIdAndCreateRequestId(UUID requesterId, UUID createRequestId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from Errand e where e.id = :id")
    Optional<Errand> findForUpdateById(@Param("id") UUID id);

    @Query("""
            select e from Errand e where e.status = com.cs3219.foc.order.model.entity.ErrandStatus.OPEN
            and e.expiresAt > :now and e.requesterId <> :userId
            and (lower(e.pickupName) like :pattern escape '!' or lower(e.deliveryLocation) like :pattern escape '!'
                 or lower(e.description) like :pattern escape '!')
            """)
    Page<Errand> findAvailable(
            @Param("userId") UUID userId,
            @Param("now") OffsetDateTime now,
            @Param("pattern") String pattern,
            Pageable pageable);

    @Query("""
            select e from Errand e where
            ((:participation = 'all' and (e.requesterId = :userId or e.courierId = :userId))
             or (:participation = 'requester' and e.requesterId = :userId)
             or (:participation = 'courier' and e.courierId = :userId))
            and e.status in :statuses
            and (lower(e.pickupName) like :pattern escape '!' or lower(e.deliveryLocation) like :pattern escape '!'
                 or lower(e.description) like :pattern escape '!')
            """)
    Page<Errand> findMine(
            @Param("userId") UUID userId,
            @Param("participation") String participation,
            @Param("statuses") List<ErrandStatus> statuses,
            @Param("pattern") String pattern,
            Pageable pageable);

    Page<Errand> findByRequesterId(UUID requesterId, Pageable pageable);

    @Query("select e.id from Errand e where e.status = :status and e.expiresAt <= :now order by e.expiresAt, e.id")
    List<UUID> findExpiredIds(
            @Param("status") ErrandStatus status, @Param("now") OffsetDateTime now, Pageable pageable);
}
