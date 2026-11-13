/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-07
 * Mode: Boilerplate generation.
 * Scope: Generated the composite JPA idempotency key based on the provided PostgreSQL schema.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import java.io.Serializable;
import java.util.Objects;

@Embeddable
public class CreditIdempotencyRecordId implements Serializable {

    @Enumerated(EnumType.STRING)
    @Column(name = "operation", length = 80)
    private IdempotencyOperation operation;

    @Column(name = "idempotency_key", length = 128)
    private String idempotencyKey;

    protected CreditIdempotencyRecordId() {
    }

    CreditIdempotencyRecordId(IdempotencyOperation operation, String idempotencyKey) {
        this.operation = operation;
        this.idempotencyKey = idempotencyKey;
    }

    @Override
    public boolean equals(Object candidate) {
        if (this == candidate) {
            return true;
        }
        if (!(candidate instanceof CreditIdempotencyRecordId other)) {
            return false;
        }
        return Objects.equals(operation, other.operation)
                && Objects.equals(idempotencyKey, other.idempotencyKey);
    }

    @Override
    public int hashCode() {
        return Objects.hash(operation, idempotencyKey);
    }
}
