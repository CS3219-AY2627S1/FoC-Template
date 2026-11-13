/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Code generation and implementation assistance.
 * Scope: Generated the Credit compensation workflow implementation from the approved cross-service contract.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "credit_compensation_result_outbox")
class CreditCompensationResultOutboxEntity {

    @Id
    @Column(name = "event_id", length = 36)
    private String eventId;

    @Column(name = "compensation_id", nullable = false, length = 36)
    private String compensationId;

    @Column(name = "command_id", nullable = false, length = 128)
    private String commandId;

    @Column(name = "event_type", nullable = false, length = 80)
    private String eventType;

    @Column(name = "event_version", nullable = false)
    private int eventVersion;

    @Column(name = "provider_resolution_revision", nullable = false)
    private long providerResolutionRevision;

    @Column(nullable = false, columnDefinition = "text")
    private String payload;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CompensationOutboxState state;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt;

    @Column(name = "lease_until")
    private Instant leaseUntil;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "last_error", length = 2000)
    private String lastError;

    protected CreditCompensationResultOutboxEntity() {
    }

    CreditCompensationResultOutboxEntity(String eventId, String compensationId, String commandId,
                                         long providerResolutionRevision, String payload, Instant now) {
        this.eventId = eventId;
        this.compensationId = compensationId;
        this.commandId = commandId;
        this.eventType = "CreditCompensationResult";
        this.eventVersion = 1;
        this.providerResolutionRevision = providerResolutionRevision;
        this.payload = payload;
        this.state = CompensationOutboxState.PENDING;
        this.createdAt = now;
        this.nextAttemptAt = now;
    }

    String eventId() { return eventId; }
    String compensationId() { return compensationId; }
    String commandId() { return commandId; }
    String eventType() { return eventType; }
    int eventVersion() { return eventVersion; }
    String payload() { return payload; }
    CompensationOutboxState state() { return state; }
    int attemptCount() { return attemptCount; }
    Instant createdAt() { return createdAt; }

    boolean canClaim(Instant now) {
        return state == CompensationOutboxState.PENDING && !nextAttemptAt.isAfter(now)
                || state == CompensationOutboxState.IN_PROGRESS
                && leaseUntil != null && !leaseUntil.isAfter(now);
    }

    void claim(Instant now, Instant leaseUntil) {
        if (!canClaim(now)) {
            throw new IllegalStateException("Compensation result cannot be claimed.");
        }
        state = CompensationOutboxState.IN_PROGRESS;
        attemptCount++;
        this.leaseUntil = leaseUntil;
    }

    void markPublished(Instant now) {
        requireInProgress();
        state = CompensationOutboxState.PUBLISHED;
        publishedAt = now;
        leaseUntil = null;
        lastError = null;
    }

    void scheduleRetry(Instant retryAt, String error) {
        requireInProgress();
        state = attemptCount >= 10 ? CompensationOutboxState.FAILED : CompensationOutboxState.PENDING;
        nextAttemptAt = retryAt;
        leaseUntil = null;
        lastError = truncate(error);
    }

    void requeuePublished(Instant now) {
        if (state == CompensationOutboxState.PUBLISHED) {
            state = CompensationOutboxState.PENDING;
            nextAttemptAt = now;
            leaseUntil = null;
        }
    }

    void redrive(Instant now) {
        if (state != CompensationOutboxState.FAILED) {
            throw new IllegalStateException("Only a failed compensation result can be redriven.");
        }
        state = CompensationOutboxState.PENDING;
        attemptCount = 0;
        nextAttemptAt = now;
        leaseUntil = null;
    }

    private void requireInProgress() {
        if (state != CompensationOutboxState.IN_PROGRESS) {
            throw new IllegalStateException("Compensation result is not claimed.");
        }
    }

    private static String truncate(String error) {
        if (error == null || error.isBlank()) return "Unknown publisher failure";
        return error.length() <= 2000 ? error : error.substring(0, 2000);
    }
}
