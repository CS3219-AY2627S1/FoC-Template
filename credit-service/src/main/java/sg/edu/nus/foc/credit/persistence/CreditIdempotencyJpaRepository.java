/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-07
 * Mode: Boilerplate generation.
 * Scope: Generated the JPA idempotency repository based on the provided PostgreSQL schema and requirements.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.persistence;

import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface CreditIdempotencyJpaRepository
        extends JpaRepository<CreditIdempotencyRecordEntity, CreditIdempotencyRecordId> {

    @Modifying
    @Query(value = """
            insert into credit_idempotency_records
                (operation, idempotency_key, payload_hash, processed_at)
            values (:#{#operation.name()}, :idempotencyKey, :payloadHash, :processedAt)
            on conflict (operation, idempotency_key) do nothing
            """, nativeQuery = true)
    int insertIfAbsent(@Param("operation") IdempotencyOperation operation,
                       @Param("idempotencyKey") String idempotencyKey,
                       @Param("payloadHash") String payloadHash,
                       @Param("processedAt") Instant processedAt);
}
