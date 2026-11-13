/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Test generation and verification assistance.
 * Scope: Generated coverage for the Credit compensation workflow and its failure cases.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class CreditCompensationPropertiesTest {

    @Test
    void normalizesConfiguredValues() {
        CreditCompensationProperties properties = new CreditCompensationProperties(
                " project ", " result-topic ", CreditCompensationProperties.Mode.EMULATOR,
                Duration.ofSeconds(3), 12);
        assertThat(properties.projectId()).isEqualTo("project");
        assertThat(properties.resultTopic()).isEqualTo("result-topic");
        assertThat(properties.messagingMode()).isEqualTo(CreditCompensationProperties.Mode.EMULATOR);
        assertThat(properties.publishTimeout()).isEqualTo(Duration.ofSeconds(3));
        assertThat(properties.outboxBatchSize()).isEqualTo(12);
    }

    @Test
    void suppliesSafeDefaultsForMissingOrInvalidSizes() {
        CreditCompensationProperties properties = new CreditCompensationProperties(
                null, null, null, null, 0);
        assertThat(properties.projectId()).isEqualTo("demo-foc-local");
        assertThat(properties.resultTopic()).isEqualTo("credit-command-compensation-result-local-v1");
        assertThat(properties.messagingMode()).isEqualTo(CreditCompensationProperties.Mode.DISABLED);
        assertThat(properties.publishTimeout()).isEqualTo(Duration.ofSeconds(10));
        assertThat(properties.outboxBatchSize()).isEqualTo(50);
    }
}
