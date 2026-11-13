/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Test generation and verification assistance.
 * Scope: Generated coverage for the Credit compensation workflow and its failure cases.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.messaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.credit.config.CreditCompensationProperties;
import sg.edu.nus.foc.credit.persistence.CreditCompensationOutboxStore;
import tools.jackson.databind.json.JsonMapper;

class CreditCompensationOutboxDispatcherTest {

    @Test
    void retryDelayGrowsExponentiallyAndCapsBelowFiveMinutes() {
        assertThat(CreditCompensationOutboxDispatcher.retryDelay(0)).isEqualTo(Duration.ofSeconds(2));
        assertThat(CreditCompensationOutboxDispatcher.retryDelay(3)).isEqualTo(Duration.ofSeconds(8));
        assertThat(CreditCompensationOutboxDispatcher.retryDelay(20)).isEqualTo(Duration.ofMinutes(5));
        assertThat(CreditCompensationOutboxDispatcher.retryDelay(20))
                .isLessThanOrEqualTo(Duration.ofMinutes(5));
    }

    @Test
    void retryDelayNeverBecomesZeroOrNegative() {
        assertThat(CreditCompensationOutboxDispatcher.retryDelay(-100)).isPositive();
    }

    @Test
    void disabledRolloutModeLeavesCommittedOutboxRowsPending() {
        CreditCompensationOutboxStore outbox = mock(CreditCompensationOutboxStore.class);
        CreditCompensationOutboxDispatcher dispatcher = new CreditCompensationOutboxDispatcher(
                outbox, mock(CreditCompensationResultPublisher.class),
                new CreditCompensationProperties("project", "result",
                        CreditCompensationProperties.Mode.DISABLED, Duration.ofSeconds(1), 50),
                JsonMapper.builder().build(), mock(MeterRegistry.class));

        dispatcher.dispatch("event-id");
        dispatcher.dispatchDue();

        verifyNoInteractions(outbox);
    }
}
