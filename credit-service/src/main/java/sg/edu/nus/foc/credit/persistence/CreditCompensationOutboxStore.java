/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Code generation and implementation assistance.
 * Scope: Generated the Credit compensation workflow implementation from the approved cross-service contract.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.persistence;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import sg.edu.nus.foc.credit.error.CreditCommandException;
import sg.edu.nus.foc.credit.error.ErrorCode;

@Repository
public class CreditCompensationOutboxStore {

    public record Entry(String eventId, String eventType, int eventVersion,
                        String payload, int attemptCount) {
    }

    private final CreditCompensationResultOutboxJpaRepository outbox;

    public CreditCompensationOutboxStore(CreditCompensationResultOutboxJpaRepository outbox) {
        this.outbox = outbox;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<Entry> claim(String eventId, Instant now, Instant leaseUntil) {
        CreditCompensationResultOutboxEntity entry = outbox.findByEventIdForUpdate(eventId).orElse(null);
        if (entry == null || !entry.canClaim(now)) {
            return Optional.empty();
        }
        entry.claim(now, leaseUntil);
        return Optional.of(snapshot(entry));
    }

    @Transactional(readOnly = true)
    public List<String> dueIds(Instant now, int limit) {
        return outbox.findDueIds(now, limit);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markPublished(String eventId, Instant now) {
        outbox.findByEventIdForUpdate(eventId).orElseThrow().markPublished(now);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void scheduleRetry(String eventId, Instant retryAt, String error) {
        outbox.findByEventIdForUpdate(eventId).orElseThrow().scheduleRetry(retryAt, error);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void redrive(String eventId, Instant now) {
        CreditCompensationResultOutboxEntity entry = outbox.findByEventIdForUpdate(eventId)
                .orElseThrow(() -> new CreditCommandException(ErrorCode.NOT_FOUND,
                        "Compensation result outbox event was not found.", null, null));
        try {
            entry.redrive(now);
        } catch (IllegalStateException exception) {
            throw new CreditCommandException(ErrorCode.CONFLICT,
                    "Only a retained FAILED compensation result may be redriven.", null, null);
        }
    }

    @Transactional(readOnly = true)
    public Optional<Instant> oldestUnfinishedCreatedAt() {
        return outbox.findOldestUnfinishedCreatedAt();
    }

    @Transactional(readOnly = true)
    public long failedCount() {
        return outbox.countByState(CompensationOutboxState.FAILED);
    }

    private static Entry snapshot(CreditCompensationResultOutboxEntity entry) {
        return new Entry(entry.eventId(), entry.eventType(), entry.eventVersion(),
                entry.payload(), entry.attemptCount());
    }
}
