/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Boilerplate generation.
 * Scope: Generated Spring Boot configuration code for team-finalized runtime and OpenAPI settings.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.config;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class ClockConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
