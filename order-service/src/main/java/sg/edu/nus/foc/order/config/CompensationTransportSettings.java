package sg.edu.nus.foc.order.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Explicit opt-in; incomplete/unsafe broker settings fail startup, never fall back. */
@Component
@ConditionalOnProperty(name = "order.commands.compensation.enabled", havingValue = "true")
public record CompensationTransportSettings(String requestTopic, String resultSubscription,
        String pushMode, String audience, String serviceAccount, String projectId) {

    @org.springframework.beans.factory.annotation.Autowired
    public CompensationTransportSettings(
            @Value("${order.commands.compensation.request-topic:}") String requestTopic,
            @Value("${order.commands.compensation.result-subscription:}") String subscription,
            @Value("${order.commands.compensation.push-mode:google}") String mode,
            @Value("${order.commands.compensation.audience:}") String audience,
            @Value("${order.commands.compensation.service-account:}") String account,
            @Value("${order.messaging.project-id:}") String project,
            @Value("${order.messaging.mode:cloud}") String messagingMode,
            @Value("${order.messaging.emulator-host:}") String broker,
            @Value("${FOC_ENVIRONMENT:local}") String environment,
            @Value("${order.security.auth.project-id:}") String authProject,
            @Value("${order.security.auth.emulator-host:}") String authHost) {
        this(required(requestTopic), required(subscription), required(mode), audience, account, required(project));
        if (requestTopic.contains("/") || subscription.contains("/")) {
            throw new IllegalArgumentException("Configure topic/subscription IDs, not paths.");
        }
        if ("emulator".equals(mode)) {
            if (!"local".equals(environment) || !project.startsWith("demo-")
                    || !authProject.startsWith("demo-") || authHost.isBlank()
                    || !"emulator".equals(messagingMode) || broker.isBlank()) {
                throw new IllegalArgumentException("Unsigned compensation push requires both local demo emulators.");
            }
        } else if (!"google".equals(mode) || !"cloud".equals(messagingMode)
                || !broker.isBlank() || !authHost.isBlank() || project.startsWith("demo-")
                || audience == null || !audience.startsWith("https://")
                || account == null || !account.endsWith(".gserviceaccount.com")) {
            throw new IllegalArgumentException("Google compensation push requires explicit cloud/OIDC settings.");
        }
    }

    public boolean emulator() { return "emulator".equals(pushMode); }
    public String subscriptionPath() {
        return "projects/" + projectId + "/subscriptions/" + resultSubscription;
    }
    private static String required(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Explicit compensation transport settings are required.");
        }
        return value;
    }
}
