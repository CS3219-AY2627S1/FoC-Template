/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation implementation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.order.config;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public record ReportCreationSettings(boolean enabled,String project,String resultTopic,String requestSubscription,
        String pushMode,String audience,String account,String emulatorHost,Duration publishTimeout){
    @org.springframework.beans.factory.annotation.Autowired
    public ReportCreationSettings(
            @Value("${order.reports.creation.enabled:false}")boolean enabled,
            @Value("${order.messaging.project-id:demo-foc}")String project,
            @Value("${order.reports.creation.result-topic:}")String resultTopic,
            @Value("${order.reports.creation.request-subscription:}")String requestSubscription,
            @Value("${order.reports.creation.push-mode:google}")String pushMode,
            @Value("${order.reports.creation.audience:}")String audience,
            @Value("${order.reports.creation.service-account:}")String account,
            @Value("${order.messaging.emulator-host:}")String emulatorHost,
            @Value("${order.messaging.publish-timeout:10s}")Duration publishTimeout,
            @Value("${order.messaging.mode:cloud}")String messagingMode,
            @Value("${FOC_ENVIRONMENT:local}")String environment,
            @Value("${order.security.auth.project-id:}")String authProject,
            @Value("${order.security.auth.emulator-host:}")String authHost){
        this(enabled, project, resultTopic, requestSubscription, pushMode, audience, account, emulatorHost, publishTimeout);
        if (enabled) {
            if (project.isBlank() || resultTopic.isBlank()
                    || requestSubscription.isBlank()
                    || publishTimeout.isNegative() || publishTimeout.isZero()) {
                throw new IllegalStateException("Report creation compensation settings are required.");
            }
            if (emulator()) {
                if (!"local".equals(environment) || !project.startsWith("demo-")
                        || !authProject.startsWith("demo-") || authHost.isBlank()
                        || !"emulator".equals(messagingMode) || emulatorHost.isBlank()) {
                    throw new IllegalStateException("Unsigned creation pushes require local demo emulators.");
                }
            } else if (!"google".equals(pushMode) || !"cloud".equals(messagingMode)
                    || !emulatorHost.isBlank() || !authHost.isBlank() || project.startsWith("demo-")
                    || audience.isBlank() || !audience.startsWith("https://")
                    || account.isBlank() || !account.endsWith(".gserviceaccount.com")) {
                throw new IllegalStateException("Creation pushes require explicit cloud/OIDC settings.");
            }
        }
    }
    public boolean emulator(){return "emulator".equals(pushMode);}
}
