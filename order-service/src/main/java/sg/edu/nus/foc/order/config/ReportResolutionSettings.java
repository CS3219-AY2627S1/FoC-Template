package sg.edu.nus.foc.order.config;

import java.net.URI;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Proposed peer contract, opt-in only; reuse the established compensation push/emulator safeguards. */
@Component
@ConditionalOnProperty(name = "order.reports.resolution.enabled", havingValue = "true")
public record ReportResolutionSettings(String baseUrl, Duration timeout, String resultTopic,
        CompensationTransportSettings transport) {
    @org.springframework.beans.factory.annotation.Autowired
    public ReportResolutionSettings(
            @Value("${order.reports.resolution.base-url:}") String base,
            @Value("${order.reports.resolution.timeout:5s}") Duration timeout,
            @Value("${order.reports.resolution.compensation-topic:}") String topic,
            @Value("${order.reports.resolution.result-topic:}") String resultTopic,
            @Value("${order.reports.resolution.result-subscription:}") String subscription,
            @Value("${order.reports.resolution.push-mode:google}") String mode,
            @Value("${order.reports.resolution.audience:}") String audience,
            @Value("${order.reports.resolution.service-account:}") String account,
            @Value("${order.messaging.project-id:}") String project,
            @Value("${order.messaging.mode:cloud}") String messagingMode,
            @Value("${order.messaging.emulator-host:}") String broker,
            @Value("${FOC_ENVIRONMENT:local}") String environment,
            @Value("${order.security.auth.project-id:}") String authProject,
            @Value("${order.security.auth.emulator-host:}") String authHost) {
        this(base, timeout, resultTopic, new CompensationTransportSettings(topic, subscription, mode,
                audience, account, project, messagingMode, broker, environment, authProject, authHost));
        URI uri = URI.create(base);
        if (uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                || !("https".equals(uri.getScheme()) || (transport.emulator() && "http".equals(uri.getScheme())))
                || timeout.isNegative() || timeout.isZero() || timeout.compareTo(Duration.ofSeconds(60)) > 0
                || resultTopic.isBlank() || resultTopic.contains("/") || resultTopic.equals(topic))
            throw new IllegalArgumentException("Explicit safe Report URL, timeout and distinct result topic are required.");
    }
}
