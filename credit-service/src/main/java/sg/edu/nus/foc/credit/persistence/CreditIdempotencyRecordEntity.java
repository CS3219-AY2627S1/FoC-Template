/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-07
 * Mode: Boilerplate generation.
 * Scope: Generated the JPA idempotency entity based on the provided PostgreSQL schema and requirements.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "credit_idempotency_records")
public class CreditIdempotencyRecordEntity {

    @EmbeddedId
    private CreditIdempotencyRecordId id;

    @Column(name = "payload_hash", nullable = false, length = 64, columnDefinition = "char(64)")
    @JdbcTypeCode(SqlTypes.CHAR)
    private String payloadHash;

    @Column(name = "processed_at", nullable = false)
    private Instant processedAt;

    protected CreditIdempotencyRecordEntity() {
    }

    String payloadHash() {
        return payloadHash;
    }
}
