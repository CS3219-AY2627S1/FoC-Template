/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation tests.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.order.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class ReportCreationSettingsTest {
    @Test
    void acceptsFullyQualifiedEmulatorSubscription() {
        assertDoesNotThrow(() -> new ReportCreationSettings(true, "demo-foc-local", "result-v1",
                "projects/demo-foc-local/subscriptions/request-local", "emulator", "", "",
                "localhost:8085", Duration.ofSeconds(10), "emulator", "local", "demo-auth",
                "localhost:9099"));
    }

    @Test
    void rejectsUnsignedEmulatorModeOutsideLocalDemoEnvironment() {
        assertThrows(IllegalStateException.class, () -> new ReportCreationSettings(true, "project",
                "result-v1", "projects/project/subscriptions/request", "emulator", "", "",
                "localhost:8085", Duration.ofSeconds(10), "emulator", "production", "auth",
                "localhost:9099"));
    }
}
