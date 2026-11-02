/* AI Assistance Disclosure: OpenAI Codex, 2026-10-29. Report saga settings; review pending. */
package sg.edu.nus.foc.reporting.resolution;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public record ResolutionSettings(boolean enabled, String project, String resultTopic,
        String subscription, String audience, String account, String emulatorHost, boolean emulatorPush) {
    @org.springframework.beans.factory.annotation.Autowired
    public ResolutionSettings(
            @Value("${REPORT_RESOLUTION_ENABLED:false}") boolean enabled,
            @Value("${REPORT_PUBSUB_PROJECT_ID:${FIRESTORE_PROJECT_ID:demo-foc}}") String project,
            @Value("${REPORT_RESOLUTION_RESULT_TOPIC:}") String resultTopic,
            @Value("${REPORT_RESOLUTION_COMPENSATION_SUBSCRIPTION:}") String subscription,
            @Value("${REPORT_RESOLUTION_PUSH_AUDIENCE:}") String audience,
            @Value("${REPORT_RESOLUTION_PUSH_SERVICE_ACCOUNT:}") String account,
            @Value("${PUBSUB_EMULATOR_HOST:}") String emulatorHost,
            @Value("${REPORT_RESOLUTION_PUSH_MODE:google}") String mode,
            @Value("${FOC_ENVIRONMENT:local}") String environment,
            @Value("${FIREBASE_AUTH_EMULATOR_HOST:}") String authEmulator,
            @Value("${foc.reporting.auth.project-id:demo-foc}") String authProject) {
        this(enabled, project, resultTopic, subscription, audience, account, emulatorHost, "emulator".equals(mode));
        if (!mode.equals("google") && !mode.equals("emulator")) throw new IllegalStateException("Invalid Report push mode.");
        if (enabled && (project.isBlank() || resultTopic.isBlank() || subscription.isBlank()))
            throw new IllegalStateException("Report saga project, result topic and request subscription are required.");
        if (enabled && emulatorPush && (!environment.equals("local") || !project.startsWith("demo-")
                || emulatorHost.isBlank() || authEmulator.isBlank() || !authProject.startsWith("demo-")))
            throw new IllegalStateException("Unsigned Report push requires local demo Auth and Pub/Sub emulators.");
        if (enabled && !emulatorPush && (!emulatorHost.isBlank() || !authEmulator.isBlank()
                || !audience.startsWith("https://") || !account.endsWith(".gserviceaccount.com")))
            throw new IllegalStateException("Cloud Report push requires audience/service identity and no emulator.");
    }
}
