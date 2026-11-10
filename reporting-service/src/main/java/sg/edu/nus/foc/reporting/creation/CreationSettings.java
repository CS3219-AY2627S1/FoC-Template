/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation implementation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.creation;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public record CreationSettings(boolean enabled, String project, String requestTopic,
        String resultSubscription, String audience, String account, String schedulerAccount, String emulatorHost,
        boolean emulatorPush) {
    @org.springframework.beans.factory.annotation.Autowired
    public CreationSettings(
            @Value("${REPORT_CREATION_ENABLED:false}") boolean enabled,
            @Value("${REPORT_PUBSUB_PROJECT_ID:${FIRESTORE_PROJECT_ID:demo-foc}}") String project,
            @Value("${REPORT_CREATION_COMPENSATION_TOPIC:}") String requestTopic,
            @Value("${REPORT_CREATION_COMPENSATION_RESULT_SUBSCRIPTION:}") String resultSubscription,
            @Value("${REPORT_CREATION_RESULT_PUSH_AUDIENCE:}") String audience,
            @Value("${REPORT_CREATION_RESULT_PUSH_SERVICE_ACCOUNT:}") String account,
            @Value("${REPORT_CREATION_SCHEDULER_SERVICE_ACCOUNT:}") String schedulerAccount,
            @Value("${PUBSUB_EMULATOR_HOST:}") String emulatorHost,
            @Value("${REPORT_CREATION_RESULT_PUSH_MODE:google}") String mode,
            @Value("${FOC_ENVIRONMENT:local}") String environment,
            @Value("${FIREBASE_AUTH_EMULATOR_HOST:}") String authEmulator) {
        this(enabled,project,requestTopic,resultSubscription,audience,account,schedulerAccount,emulatorHost,"emulator".equals(mode));
        if(!mode.equals("google")&&!mode.equals("emulator")) throw new IllegalStateException("Invalid creation push mode.");
        if(enabled&&(project.isBlank()||requestTopic.isBlank()||resultSubscription.isBlank()))
            throw new IllegalStateException("Creation compensation topic and result subscription are required.");
        if(enabled&&emulatorPush&&(!"local".equals(environment)||!project.startsWith("demo-")
                ||emulatorHost.isBlank()||authEmulator.isBlank()))
            throw new IllegalStateException("Unsigned creation push is local-emulator only.");
        if(enabled&&!emulatorPush&&(project.startsWith("demo-")||!emulatorHost.isBlank()||!authEmulator.isBlank()
                ||!audience.startsWith("https://")||!account.endsWith(".gserviceaccount.com")
                ||!schedulerAccount.endsWith(".gserviceaccount.com")))
            throw new IllegalStateException("Cloud creation result push requires audience and service identity.");
    }
}
