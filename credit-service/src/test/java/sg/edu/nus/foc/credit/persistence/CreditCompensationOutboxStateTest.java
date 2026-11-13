/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Test generation and verification assistance.
 * Scope: Generated coverage for the Credit compensation workflow and its failure cases.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class CreditCompensationOutboxStateTest {

    private static final Instant NOW = Instant.parse("2026-10-26T12:00:00Z");

    @Test
    void transitionsThroughClaimRetryPublishFailureAndRedrive() {
        CreditCompensationResultOutboxEntity entry = entry();
        assertThat(entry.canClaim(NOW)).isTrue();

        entry.claim(NOW, NOW.plusSeconds(120));
        assertThat(entry.state()).isEqualTo(CompensationOutboxState.IN_PROGRESS);
        entry.requeuePublished(NOW.plusSeconds(1));
        assertThat(entry.state()).isEqualTo(CompensationOutboxState.IN_PROGRESS);
        assertThat(entry.canClaim(NOW.plusSeconds(119))).isFalse();
        assertThat(entry.canClaim(NOW.plusSeconds(120))).isTrue();
        entry.scheduleRetry(NOW.plusSeconds(2), "temporary");
        assertThat(entry.state()).isEqualTo(CompensationOutboxState.PENDING);
        assertThat(entry.canClaim(NOW.plusSeconds(1))).isFalse();
        assertThat(entry.canClaim(NOW.plusSeconds(2))).isTrue();

        for (int attempt = 2; attempt <= 10; attempt++) {
            entry.claim(NOW.plusSeconds(attempt), NOW.plusSeconds(attempt + 120));
            entry.scheduleRetry(NOW.plusSeconds(attempt + 1), "failure");
        }
        assertThat(entry.state()).isEqualTo(CompensationOutboxState.FAILED);
        assertThat(entry.canClaim(NOW.plusSeconds(999))).isFalse();

        entry.redrive(NOW.plusSeconds(1000));
        entry.claim(NOW.plusSeconds(1000), NOW.plusSeconds(1120));
        entry.markPublished(NOW.plusSeconds(1001));
        assertThat(entry.state()).isEqualTo(CompensationOutboxState.PUBLISHED);
        entry.requeuePublished(NOW.plusSeconds(1002));
        assertThat(entry.state()).isEqualTo(CompensationOutboxState.PENDING);
    }

    @Test
    void rejectsIllegalTransitionsAndDerivesStableResultIds() {
        CreditCompensationResultOutboxEntity entry = entry();
        assertThatThrownBy(() -> entry.markPublished(NOW))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> entry.redrive(NOW))
                .isInstanceOf(IllegalStateException.class);

        assertThat(CreditCompensationStore.resultId("compensation", "COMPENSATED", 1))
                .isEqualTo(CreditCompensationStore.resultId("compensation", "COMPENSATED", 1))
                .isNotEqualTo(CreditCompensationStore.resultId("compensation", "COMPENSATED", 2));
    }

    private static CreditCompensationResultOutboxEntity entry() {
        return new CreditCompensationResultOutboxEntity(
                "22222222-2222-4222-8222-222222222222",
                "11111111-1111-4111-8111-111111111111", "command", 1, "{}", NOW);
    }
}
