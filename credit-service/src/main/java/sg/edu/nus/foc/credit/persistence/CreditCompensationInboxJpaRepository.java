/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Code generation and implementation assistance.
 * Scope: Generated the Credit compensation workflow implementation from the approved cross-service contract.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.persistence;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface CreditCompensationInboxJpaRepository
        extends JpaRepository<CreditCompensationInboxEntity, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select inbox from CreditCompensationInboxEntity inbox where inbox.eventId = :eventId")
    Optional<CreditCompensationInboxEntity> findByEventIdForUpdate(@Param("eventId") String eventId);

    Optional<CreditCompensationInboxEntity> findByCommandId(String commandId);
}
