/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-26
 * Mode: Code generation.
 * Scope: Added equality and hash-code contract tests for the composite idempotency key.
 * Author review: Pending.
 */
package sg.edu.nus.foc.credit.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class CreditIdempotencyRecordIdTest {

    @Test
    void equalIdsHaveEqualHashCodes() {
        CreditIdempotencyRecordId id = new CreditIdempotencyRecordId(
                IdempotencyOperation.USER_REGISTERED, "event-1");
        CreditIdempotencyRecordId equalId = new CreditIdempotencyRecordId(
                IdempotencyOperation.USER_REGISTERED, "event-1");

        assertThat(id).isEqualTo(id).isEqualTo(equalId);
        assertThat(id.hashCode()).isEqualTo(equalId.hashCode());
    }

    @Test
    void idsAreUnequalWhenTypeOperationOrKeyDiffers() {
        CreditIdempotencyRecordId id = new CreditIdempotencyRecordId(
                IdempotencyOperation.USER_REGISTERED, "event-1");

        assertThat(id)
                .isNotEqualTo(null)
                .isNotEqualTo("event-1")
                .isNotEqualTo(new CreditIdempotencyRecordId(
                        IdempotencyOperation.ORDER_COMPLETION, "event-1"))
                .isNotEqualTo(new CreditIdempotencyRecordId(
                        IdempotencyOperation.USER_REGISTERED, "event-2"));
    }
}
