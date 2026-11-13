/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Code generation and implementation assistance.
 * Scope: Generated the Credit compensation workflow implementation from the approved cross-service contract.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("foc.credit.compensation")
public record CreditCompensationProperties(
        String projectId,
        String resultTopic,
        Mode messagingMode,
        Duration publishTimeout,
        int outboxBatchSize) {

    public enum Mode { DISABLED, GOOGLE, EMULATOR }

    public CreditCompensationProperties {
        projectId = value(projectId, "demo-foc-local");
        resultTopic = value(resultTopic, "credit-command-compensation-result-local-v1");
        messagingMode = messagingMode == null ? Mode.DISABLED : messagingMode;
        publishTimeout = publishTimeout == null ? Duration.ofSeconds(10) : publishTimeout;
        outboxBatchSize = outboxBatchSize <= 0 ? 50 : outboxBatchSize;
    }

    private static String value(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
