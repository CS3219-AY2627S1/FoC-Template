/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-08
 * Mode: Code generation.
 * Scope: Generated the subscription to handle the order service pub/sub events based on the provided requirements contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("foc.credit.push")
public record CreditPushProperties(
        String projectId,
        String audience,
        String serviceAccount,
        String completionSubscription,
        String openRefundSubscription,
        String compensationSubscription,
        String userCreatedSubscription) {

    public CreditPushProperties {
        projectId = defaultValue(projectId, "demo-foc");
        audience = defaultValue(audience, "http://localhost:8080");
        serviceAccount = defaultValue(serviceAccount, "foc-credit-push-local@demo-foc.iam.gserviceaccount.com");
        completionSubscription = defaultValue(completionSubscription, "credit-order-completion-dev-v1");
        openRefundSubscription = defaultValue(openRefundSubscription, "credit-open-order-refund-dev-v1");
        compensationSubscription = defaultValue(compensationSubscription,
                "credit-command-compensation-dev-v1");
        userCreatedSubscription = defaultValue(userCreatedSubscription, "credit-user-created-dev-v1");
    }

    public String completionSubscriptionPath() {
        return subscriptionPath(completionSubscription);
    }

    public String openRefundSubscriptionPath() {
        return subscriptionPath(openRefundSubscription);
    }

    public String compensationSubscriptionPath() {
        return subscriptionPath(compensationSubscription);
    }

    public String userCreatedSubscriptionPath() {
        return subscriptionPath(userCreatedSubscription);
    }

    private String subscriptionPath(String subscriptionId) {
        return "projects/" + projectId + "/subscriptions/" + subscriptionId;
    }

    private static String defaultValue(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
