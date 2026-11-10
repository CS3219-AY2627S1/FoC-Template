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
    private static final Duration TIMEOUT = Duration.ofSeconds(10);

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

    @Test
    void disabledModeDoesNotRequireTransportConfiguration() {
        assertDoesNotThrow(() -> new ReportCreationSettings(false, "", "", "", "invalid", "", "",
                "", Duration.ZERO, "invalid", "production", "", ""));
    }

    @Test
    void acceptsExplicitCloudOidcConfiguration() {
        assertDoesNotThrow(() -> cloud("prod-project", "result-v1",
                "projects/prod-project/subscriptions/request", "google", "https://orders.example.test",
                "report@prod-project.iam.gserviceaccount.com", "", TIMEOUT, "cloud", ""));
    }

    @Test
    void rejectsMissingRequiredAndUnsafeEmulatorConfiguration() {
        assertThrows(IllegalStateException.class, () -> emulator("", "result-v1",
                "projects/demo-foc-local/subscriptions/request", TIMEOUT, "local", "demo-auth",
                "localhost:9099", "emulator", "localhost:8085"));
        assertThrows(IllegalStateException.class, () -> emulator("demo-foc-local", "",
                "projects/demo-foc-local/subscriptions/request", TIMEOUT, "local", "demo-auth",
                "localhost:9099", "emulator", "localhost:8085"));
        assertThrows(IllegalStateException.class, () -> emulator("demo-foc-local", "result-v1", "",
                TIMEOUT, "local", "demo-auth", "localhost:9099", "emulator", "localhost:8085"));
        assertThrows(IllegalStateException.class, () -> emulator("demo-foc-local", "result-v1",
                "projects/demo-foc-local/subscriptions/request", Duration.ZERO, "local", "demo-auth",
                "localhost:9099", "emulator", "localhost:8085"));
        assertThrows(IllegalStateException.class, () -> emulator("demo-foc-local", "result-v1",
                "projects/demo-foc-local/subscriptions/request", Duration.ofSeconds(-1), "local", "demo-auth",
                "localhost:9099", "emulator", "localhost:8085"));
        assertThrows(IllegalStateException.class, () -> emulator("project", "result-v1",
                "projects/project/subscriptions/request", TIMEOUT, "local", "demo-auth",
                "localhost:9099", "emulator", "localhost:8085"));
        assertThrows(IllegalStateException.class, () -> emulator("demo-foc-local", "result-v1",
                "projects/demo-foc-local/subscriptions/request", TIMEOUT, "local", "auth",
                "localhost:9099", "emulator", "localhost:8085"));
        assertThrows(IllegalStateException.class, () -> emulator("demo-foc-local", "result-v1",
                "projects/demo-foc-local/subscriptions/request", TIMEOUT, "local", "demo-auth", "",
                "emulator", "localhost:8085"));
        assertThrows(IllegalStateException.class, () -> emulator("demo-foc-local", "result-v1",
                "projects/demo-foc-local/subscriptions/request", TIMEOUT, "local", "demo-auth",
                "localhost:9099", "cloud", "localhost:8085"));
        assertThrows(IllegalStateException.class, () -> emulator("demo-foc-local", "result-v1",
                "projects/demo-foc-local/subscriptions/request", TIMEOUT, "local", "demo-auth",
                "localhost:9099", "emulator", ""));
    }

    @Test
    void rejectsIncompleteOrEmulatorContaminatedCloudConfiguration() {
        assertThrows(IllegalStateException.class, () -> cloud("prod-project", "result-v1",
                "projects/prod-project/subscriptions/request", "invalid", "https://orders.example.test",
                "report@prod-project.iam.gserviceaccount.com", "", TIMEOUT, "cloud", ""));
        assertThrows(IllegalStateException.class, () -> cloud("prod-project", "result-v1",
                "projects/prod-project/subscriptions/request", "google", "https://orders.example.test",
                "report@prod-project.iam.gserviceaccount.com", "", TIMEOUT, "emulator", ""));
        assertThrows(IllegalStateException.class, () -> cloud("prod-project", "result-v1",
                "projects/prod-project/subscriptions/request", "google", "https://orders.example.test",
                "report@prod-project.iam.gserviceaccount.com", "localhost:8085", TIMEOUT, "cloud", ""));
        assertThrows(IllegalStateException.class, () -> cloud("prod-project", "result-v1",
                "projects/prod-project/subscriptions/request", "google", "https://orders.example.test",
                "report@prod-project.iam.gserviceaccount.com", "", TIMEOUT, "cloud", "localhost:9099"));
        assertThrows(IllegalStateException.class, () -> cloud("demo-project", "result-v1",
                "projects/demo-project/subscriptions/request", "google", "https://orders.example.test",
                "report@demo-project.iam.gserviceaccount.com", "", TIMEOUT, "cloud", ""));
        assertThrows(IllegalStateException.class, () -> cloud("prod-project", "result-v1",
                "projects/prod-project/subscriptions/request", "google", "",
                "report@prod-project.iam.gserviceaccount.com", "", TIMEOUT, "cloud", ""));
        assertThrows(IllegalStateException.class, () -> cloud("prod-project", "result-v1",
                "projects/prod-project/subscriptions/request", "google", "orders.example.test",
                "report@prod-project.iam.gserviceaccount.com", "", TIMEOUT, "cloud", ""));
        assertThrows(IllegalStateException.class, () -> cloud("prod-project", "result-v1",
                "projects/prod-project/subscriptions/request", "google", "https://orders.example.test", "",
                "", TIMEOUT, "cloud", ""));
        assertThrows(IllegalStateException.class, () -> cloud("prod-project", "result-v1",
                "projects/prod-project/subscriptions/request", "google", "https://orders.example.test",
                "report@example.test", "", TIMEOUT, "cloud", ""));
    }

    private static ReportCreationSettings emulator(String project, String resultTopic, String subscription,
            Duration timeout, String environment, String authProject, String authHost, String messagingMode,
            String emulatorHost) {
        return new ReportCreationSettings(true, project, resultTopic, subscription, "emulator", "", "",
                emulatorHost, timeout, messagingMode, environment, authProject, authHost);
    }

    private static ReportCreationSettings cloud(String project, String resultTopic, String subscription,
            String pushMode, String audience, String account, String emulatorHost, Duration timeout,
            String messagingMode, String authHost) {
        return new ReportCreationSettings(true, project, resultTopic, subscription, pushMode, audience, account,
                emulatorHost, timeout, messagingMode, "production", "auth-project", authHost);
    }
}
