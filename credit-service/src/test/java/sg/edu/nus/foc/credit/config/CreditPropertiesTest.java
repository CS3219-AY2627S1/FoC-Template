/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Test generation and testing assistance.
 * Scope: Generated initial configuration tests for team-finalized runtime settings.
 * Author review:  I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;

class CreditPropertiesTest {

    @Test
    void appliesSafeDefaults() {
        CreditProperties properties = new CreditProperties(null, null, null);
        assertThat(properties.auth().projectId()).isEqualTo("demo-foc");
        assertThat(properties.auth().usesEmulator()).isFalse();
        assertThat(properties.userService().mode()).isEqualTo(CreditProperties.Mode.MOCK);
        assertThat(properties.userService().baseUrl()).isEmpty();
        assertThat(properties.userService().mockAdminEmails()).isEmpty();
        assertThat(properties.userService().timeout()).isEqualTo(Duration.ofSeconds(3));
        assertThat(properties.corsOrigins()).isEmpty();
    }

    @Test
    void trimsConfigurationAndCopiesOrigins() {
        List<String> origins = new java.util.ArrayList<>(List.of("https://example.com"));
        List<String> admins = new java.util.ArrayList<>(List.of("admin@u.nus.edu"));
        CreditProperties properties = new CreditProperties(
                new CreditProperties.AuthSettings(" auth-project ", " localhost:9099 "),
                new CreditProperties.UserServiceSettings(
                        CreditProperties.Mode.HTTP, " http://user-service ", admins, Duration.ofSeconds(1)),
                origins);
        origins.clear();
        admins.clear();
        assertThat(properties.auth().projectId()).isEqualTo("auth-project");
        assertThat(properties.auth().usesEmulator()).isTrue();
        assertThat(properties.userService().baseUrl()).isEqualTo("http://user-service");
        assertThat(properties.userService().mockAdminEmails()).containsExactly("admin@u.nus.edu");
        assertThat(properties.userService().timeout()).isEqualTo(Duration.ofSeconds(1));
        assertThat(properties.corsOrigins()).containsExactly("https://example.com");
    }
}
