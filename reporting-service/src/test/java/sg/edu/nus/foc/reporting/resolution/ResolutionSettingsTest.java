/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-11-10
 * Mode: Code generation and testing assistance.
 * Scope: Generated the report resolution test cases
 * Author review: I reviewed for correctness.
 */

package sg.edu.nus.foc.reporting.resolution;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ResolutionSettingsTest {
    @Test
    void acceptsDisabledCloudAndLocalEmulatorConfigurations() {
        assertFalse(settings(false, "", "", "", "", "", "", "google", "local", "", "").enabled());

        var cloud = settings(true, "prod-foc", "results", "requests", "https://reporting.example",
                "reporting@example.iam.gserviceaccount.com", "", "google", "staging", "", "prod-auth");
        assertFalse(cloud.emulatorPush());

        var emulator = settings(true, "demo-foc", "results", "requests", "", "", "localhost:8085",
                "emulator", "local", "localhost:9099", "demo-auth");
        assertTrue(emulator.emulatorPush());
    }

    @Test
    void rejectsInvalidModeAndIncompleteSagaCoordinates() {
        assertThrows(IllegalStateException.class, () ->
                settings(false, "p", "", "", "", "", "", "invalid", "local", "", "demo-auth"));
        assertThrows(IllegalStateException.class, () ->
                settings(true, "", "results", "requests", "", "", "", "google", "local", "", "demo-auth"));
        assertThrows(IllegalStateException.class, () ->
                settings(true, "p", "", "requests", "", "", "", "google", "local", "", "demo-auth"));
        assertThrows(IllegalStateException.class, () ->
                settings(true, "p", "results", "", "", "", "", "google", "local", "", "demo-auth"));
    }

    @Test
    void rejectsUnsafeEmulatorAndCloudPushConfigurations() {
        assertInvalidEmulator("staging", "demo-foc", "localhost:8085", "localhost:9099", "demo-auth");
        assertInvalidEmulator("local", "prod-foc", "localhost:8085", "localhost:9099", "demo-auth");
        assertInvalidEmulator("local", "demo-foc", "", "localhost:9099", "demo-auth");
        assertInvalidEmulator("local", "demo-foc", "localhost:8085", "", "demo-auth");
        assertInvalidEmulator("local", "demo-foc", "localhost:8085", "localhost:9099", "prod-auth");

        assertInvalidCloud("localhost:8085", "", "https://reporting.example",
                "reporting@example.iam.gserviceaccount.com");
        assertInvalidCloud("", "localhost:9099", "https://reporting.example",
                "reporting@example.iam.gserviceaccount.com");
        assertInvalidCloud("", "", "http://reporting.example", "reporting@example.iam.gserviceaccount.com");
        assertInvalidCloud("", "", "https://reporting.example", "reporting@example.com");
    }

    private void assertInvalidEmulator(String environment, String project, String pubsubEmulator,
                                       String authEmulator, String authProject) {
        assertThrows(IllegalStateException.class, () -> settings(true, project, "results", "requests", "", "",
                pubsubEmulator, "emulator", environment, authEmulator, authProject));
    }

    private void assertInvalidCloud(String pubsubEmulator, String authEmulator, String audience, String account) {
        assertThrows(IllegalStateException.class, () -> settings(true, "prod-foc", "results", "requests", audience,
                account, pubsubEmulator, "google", "staging", authEmulator, "prod-auth"));
    }

    private ResolutionSettings settings(boolean enabled, String project, String resultTopic, String subscription,
                                        String audience, String account, String emulatorHost, String mode,
                                        String environment, String authEmulator, String authProject) {
        return new ResolutionSettings(enabled, project, resultTopic, subscription, audience, account, emulatorHost,
                mode, environment, authEmulator, authProject);
    }
}
