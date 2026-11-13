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
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "credit_compensation_inbox")
class CreditCompensationInboxEntity {

    @Id
    @Column(name = "event_id", length = 36)
    private String eventId;

    @Column(name = "command_id", nullable = false, length = 128)
    private String commandId;

    @Column(nullable = false)
    private long generation;

    @Column(name = "binding_hash", nullable = false, length = 64)
    private String bindingHash;

    @Column(name = "payload_hash", nullable = false, length = 64)
    private String payloadHash;

    @Column(nullable = false, length = 32)
    private String outcome;

    @Column(nullable = false, length = 80)
    private String code;

    @Column(name = "result_event_id", nullable = false, length = 36)
    private String resultEventId;

    @Column(name = "provider_resolution_revision", nullable = false)
    private long providerResolutionRevision;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected CreditCompensationInboxEntity() {
    }

    CreditCompensationInboxEntity(String eventId, String commandId, long generation,
                                  String bindingHash, String payloadHash, String outcome,
                                  String code, String resultEventId, long resolutionRevision,
                                  Instant now) {
        this.eventId = eventId;
        this.commandId = commandId;
        this.generation = generation;
        this.bindingHash = bindingHash;
        this.payloadHash = payloadHash;
        this.outcome = outcome;
        this.code = code;
        this.resultEventId = resultEventId;
        this.providerResolutionRevision = resolutionRevision;
        this.createdAt = now;
        this.updatedAt = now;
    }

    String eventId() { return eventId; }
    String commandId() { return commandId; }
    long generation() { return generation; }
    String bindingHash() { return bindingHash; }
    String payloadHash() { return payloadHash; }
    String outcome() { return outcome; }
    String code() { return code; }
    String resultEventId() { return resultEventId; }
    long providerResolutionRevision() { return providerResolutionRevision; }
}
