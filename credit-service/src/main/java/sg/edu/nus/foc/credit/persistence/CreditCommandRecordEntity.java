/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-11
 * Mode: Code generation.
 * Scope: Generated the credit command table based on the agreed contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import sg.edu.nus.foc.credit.credit.CreditCommandOperation;
import sg.edu.nus.foc.credit.credit.CreditCommandOutcome;
import sg.edu.nus.foc.credit.credit.CreditCommandResult;

@Entity
@Table(name = "credit_command_records")
public class CreditCommandRecordEntity {

    @Id
    @Column(name = "command_id", length = 128)
    private String commandId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private CreditCommandOperation operation;

    @Column(name = "actor_id", nullable = false, length = 128)
    private String actorId;

    @Column(name = "order_id", nullable = false, length = 128)
    private String orderId;

    private Long amount;

    @Column(name = "payload_hash", nullable = false, length = 64)
    private String payloadHash;

    @Column(name = "highest_generation", nullable = false)
    private long highestGeneration;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CreditCommandOutcome outcome;

    @Column(nullable = false, length = 80)
    private String code;

    @Column(name = "result_json")
    private String resultJson;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "effect_revision")
    private Long effectRevision;

    @Column(name = "prior_courier_id", length = 128)
    private String priorCourierId;

    @Column(name = "prior_assignment_identity", length = 128)
    private String priorAssignmentIdentity;

    @Column(name = "prior_revision")
    private Long priorRevision;

    @Column(name = "provider_resolution_revision", nullable = false)
    private long providerResolutionRevision;

    protected CreditCommandRecordEntity() {
    }

    String commandId() {
        return commandId;
    }

    CreditCommandOperation operation() {
        return operation;
    }

    String actorId() {
        return actorId;
    }

    String orderId() {
        return orderId;
    }

    Long amount() {
        return amount;
    }

    String payloadHash() {
        return payloadHash;
    }

    long highestGeneration() {
        return highestGeneration;
    }

    CreditCommandOutcome outcome() {
        return outcome;
    }

    String code() {
        return code;
    }

    String resultJson() {
        return resultJson;
    }

    Long effectRevision() {
        return effectRevision;
    }

    String priorCourierId() {
        return priorCourierId;
    }

    String priorAssignmentIdentity() {
        return priorAssignmentIdentity;
    }

    Long priorRevision() {
        return priorRevision;
    }

    long providerResolutionRevision() {
        return providerResolutionRevision;
    }

    void recordEffect(long revision) {
        effectRevision = revision;
    }

    void recordClearPreimage(String courierId, String assignmentIdentity, long revision) {
        priorCourierId = courierId;
        priorAssignmentIdentity = assignmentIdentity;
        priorRevision = revision;
    }

    long nextProviderResolutionRevision() {
        return ++providerResolutionRevision;
    }

    void advanceGeneration(long generation, Instant now) {
        highestGeneration = generation;
        updatedAt = now;
    }

    void complete(CreditCommandOutcome completedOutcome, String completedCode,
                  String savedResultJson, Instant now) {
        outcome = completedOutcome;
        code = completedCode;
        resultJson = savedResultJson;
        completedAt = now;
        updatedAt = now;
    }

    CreditCommandResult toResult() {
        return new CreditCommandResult(commandId, operation, orderId, outcome, code);
    }
}
