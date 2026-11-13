/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Code generation and implementation assistance.
 * Scope: Generated the Credit compensation workflow implementation from the approved cross-service contract.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.persistence;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface CreditCompensationResultOutboxJpaRepository
        extends JpaRepository<CreditCompensationResultOutboxEntity, String> {

    long countByState(CompensationOutboxState state);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select outbox from CreditCompensationResultOutboxEntity outbox where outbox.eventId = :eventId")
    Optional<CreditCompensationResultOutboxEntity> findByEventIdForUpdate(@Param("eventId") String eventId);

    @Query(value = """
            select event_id from credit_compensation_result_outbox
            where (state = 'PENDING' and next_attempt_at <= :now)
               or (state = 'IN_PROGRESS' and lease_until <= :now)
            order by next_attempt_at, created_at
            limit :limit
            """, nativeQuery = true)
    List<String> findDueIds(@Param("now") Instant now, @Param("limit") int limit);

    @Query(value = """
            select min(created_at) from credit_compensation_result_outbox
            where state in ('PENDING', 'IN_PROGRESS', 'FAILED')
            """, nativeQuery = true)
    Optional<Instant> findOldestUnfinishedCreatedAt();
}
