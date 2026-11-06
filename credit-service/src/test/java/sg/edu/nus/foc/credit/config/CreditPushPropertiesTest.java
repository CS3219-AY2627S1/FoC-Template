/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-08
 * Mode: Test generation.
 * Scope: Generate tests based on the provided scope.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class CreditPushPropertiesTest {

    @Test
    void buildsFullyQualifiedSubscriptionNames() {
        CreditPushProperties properties = new CreditPushProperties(
                " project ", " audience ", " push@u.nus.edu ",
                " completion ", " refund ", " compensation ", " user-created ");

        assertThat(properties.audience()).isEqualTo("audience");
        assertThat(properties.serviceAccount()).isEqualTo("push@u.nus.edu");
        assertThat(properties.completionSubscriptionPath())
                .isEqualTo("projects/project/subscriptions/completion");
        assertThat(properties.openRefundSubscriptionPath())
                .isEqualTo("projects/project/subscriptions/refund");
        assertThat(properties.compensationSubscriptionPath())
                .isEqualTo("projects/project/subscriptions/compensation");
        assertThat(properties.userCreatedSubscriptionPath())
                .isEqualTo("projects/project/subscriptions/user-created");
    }

    @Test
    void suppliesSafeLocalDefaults() {
        CreditPushProperties properties = new CreditPushProperties(null, null, null, null, null, null, null);

        assertThat(properties.projectId()).isEqualTo("demo-foc");
        assertThat(properties.audience()).isEqualTo("http://localhost:8080");
        assertThat(properties.completionSubscriptionPath())
                .isEqualTo("projects/demo-foc/subscriptions/credit-order-completion-dev-v1");
        assertThat(properties.compensationSubscriptionPath())
                .isEqualTo("projects/demo-foc/subscriptions/credit-command-compensation-dev-v1");
        assertThat(properties.userCreatedSubscriptionPath())
                .isEqualTo("projects/demo-foc/subscriptions/credit-user-created-dev-v1");
    }
}
