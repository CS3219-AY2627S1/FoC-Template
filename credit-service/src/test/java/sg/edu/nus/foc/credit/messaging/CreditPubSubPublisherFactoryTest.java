/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Test generation and verification assistance.
 * Scope: Generated coverage for the Credit compensation workflow and its failure cases.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.messaging;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.credit.config.CreditCompensationProperties;

class CreditPubSubPublisherFactoryTest {

    @Test
    void acceptsOnlyAnExplicitLocalDemoEmulatorConfiguration() {
        CreditCompensationProperties emulator = properties(CreditCompensationProperties.Mode.EMULATOR,
                "demo-foc-local");
        CreditPubSubPublisherFactory factory = new CreditPubSubPublisherFactory(
                emulator, "127.0.0.1:8085", "local");
        factory.close();

        assertThatThrownBy(() -> new CreditPubSubPublisherFactory(
                emulator, "127.0.0.1:8085", "production"))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("local");
        assertThatThrownBy(() -> new CreditPubSubPublisherFactory(
                properties(CreditCompensationProperties.Mode.EMULATOR, "real-project"),
                "127.0.0.1:8085", "local"))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("demo");
    }

    @Test
    void googleTransportRejectsAnEmulatorHost() {
        CreditCompensationProperties google = properties(CreditCompensationProperties.Mode.GOOGLE,
                "real-project");
        new CreditPubSubPublisherFactory(google, "", "production").close();
        assertThatThrownBy(() -> new CreditPubSubPublisherFactory(
                google, "127.0.0.1:8085", "production"))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("must not");
    }

    @Test
    void disabledTransportIgnoresAnEmulatorHostButCannotCreateAPublisher() {
        CreditPubSubPublisherFactory factory = new CreditPubSubPublisherFactory(
                properties(CreditCompensationProperties.Mode.DISABLED, "real-project"),
                "127.0.0.1:8085", "production");
        assertThatThrownBy(() -> factory.forTopic("real-project", "result"))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("disabled");
        factory.close();
    }

    private static CreditCompensationProperties properties(CreditCompensationProperties.Mode mode,
                                                            String project) {
        return new CreditCompensationProperties(project, "result", mode, Duration.ofSeconds(1), 50);
    }
}
