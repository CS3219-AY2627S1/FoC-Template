/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation tests.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.creation;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class CreationSettingsTest {
    @Test
    void acceptsFullyQualifiedEmulatorSubscription() {
        assertDoesNotThrow(() -> new CreationSettings(true, "demo-foc-local", "request-v1",
                "projects/demo-foc-local/subscriptions/result-local", "", "", "", "localhost:8085",
                "emulator", "local", "localhost:9099"));
    }

    @Test
    void rejectsUnsignedEmulatorModeOutsideLocalDemoEnvironment() {
        assertThrows(IllegalStateException.class, () -> new CreationSettings(true, "production-project",
                "request-v1", "projects/production-project/subscriptions/result", "", "", "",
                "localhost:8085", "emulator", "production", "localhost:9099"));
    }
}
