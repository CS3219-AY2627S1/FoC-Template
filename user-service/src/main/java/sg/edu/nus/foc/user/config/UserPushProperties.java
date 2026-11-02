/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-08
 * Mode: Code generation.
 * Scope: Generated the subscription to handle the order service pub/sub events based on the provided requirements contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.user.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("foc.user.push")
public record UserPushProperties(
        String projectId,
        String audience,
        String serviceAccount,
        String penaltyAdditionSubscription,
        String penaltyDeductionSubscription) {

    public UserPushProperties {
        projectId = defaultValue(projectId, "demo-foc-local");
        audience = defaultValue(audience, "http://localhost:8080");
        serviceAccount = defaultValue(serviceAccount, "foc-user-push-local@demo-foc-local.iam.gserviceaccount.com");
        penaltyAdditionSubscription = defaultValue(penaltyAdditionSubscription, "user-courier-penalty-addition-local-v1");
        penaltyDeductionSubscription = defaultValue(penaltyDeductionSubscription, "user-courier-penalty-deduction-local-v1");
    }

    public String penaltyAdditionSubscriptionPath() {
        return subscriptionPath(penaltyAdditionSubscription);
    }

    public String penaltyDeductionSubscriptionPath() {
        return subscriptionPath(penaltyDeductionSubscription);
    }

    private String subscriptionPath(String subscriptionId) {
        return "projects/" + projectId + "/subscriptions/" + subscriptionId;
    }

    private static String defaultValue(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}