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

    @Test
    void validatesRequiredTopicsAndPushMode() {
        assertThrows(IllegalStateException.class, () -> configured("other", "demo-foc", "request", "result",
                "local", "localhost:8085", "localhost:9099", "", "", ""));
        assertThrows(IllegalStateException.class, () -> configured("emulator", "", "request", "result",
                "local", "localhost:8085", "localhost:9099", "", "", ""));
        assertThrows(IllegalStateException.class, () -> configured("emulator", "demo-foc", "", "result",
                "local", "localhost:8085", "localhost:9099", "", "", ""));
        assertThrows(IllegalStateException.class, () -> configured("emulator", "demo-foc", "request", "",
                "local", "localhost:8085", "localhost:9099", "", "", ""));
    }

    @Test
    void confinesUnsignedPushToCompleteLocalEmulatorConfiguration() {
        assertThrows(IllegalStateException.class, () -> configured("emulator", "demo-foc", "request", "result",
                "staging", "localhost:8085", "localhost:9099", "", "", ""));
        assertThrows(IllegalStateException.class, () -> configured("emulator", "project", "request", "result",
                "local", "localhost:8085", "localhost:9099", "", "", ""));
        assertThrows(IllegalStateException.class, () -> configured("emulator", "demo-foc", "request", "result",
                "local", "", "localhost:9099", "", "", ""));
        assertThrows(IllegalStateException.class, () -> configured("emulator", "demo-foc", "request", "result",
                "local", "localhost:8085", "", "", "", ""));
    }

    @Test
    void acceptsValidCloudPushAndRejectsEachUnsafeCloudSetting() {
        assertDoesNotThrow(() -> configured("google", "production-project", "request", "result",
                "production", "", "", "https://reports.example", "push@g.iam.gserviceaccount.com",
                "scheduler@g.iam.gserviceaccount.com"));
        assertThrows(IllegalStateException.class, () -> configured("google", "demo-foc", "request", "result",
                "production", "", "", "https://reports.example", "push@g.iam.gserviceaccount.com",
                "scheduler@g.iam.gserviceaccount.com"));
        assertThrows(IllegalStateException.class, () -> configured("google", "production-project", "request", "result",
                "production", "localhost:8085", "", "https://reports.example", "push@g.iam.gserviceaccount.com",
                "scheduler@g.iam.gserviceaccount.com"));
        assertThrows(IllegalStateException.class, () -> configured("google", "production-project", "request", "result",
                "production", "", "localhost:9099", "https://reports.example", "push@g.iam.gserviceaccount.com",
                "scheduler@g.iam.gserviceaccount.com"));
        assertThrows(IllegalStateException.class, () -> configured("google", "production-project", "request", "result",
                "production", "", "", "http://reports.example", "push@g.iam.gserviceaccount.com",
                "scheduler@g.iam.gserviceaccount.com"));
        assertThrows(IllegalStateException.class, () -> configured("google", "production-project", "request", "result",
                "production", "", "", "https://reports.example", "push@example.com",
                "scheduler@g.iam.gserviceaccount.com"));
        assertThrows(IllegalStateException.class, () -> configured("google", "production-project", "request", "result",
                "production", "", "", "https://reports.example", "push@g.iam.gserviceaccount.com",
                "scheduler@example.com"));
    }

    private static CreationSettings configured(String mode, String project, String topic, String subscription,
            String environment, String emulator, String authEmulator, String audience, String account,
            String scheduler) {
        return new CreationSettings(true, project, topic, subscription, audience, account, scheduler,
                emulator, mode, environment, authEmulator);
    }
}
