/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Boilerplate generation.
 * Scope: Generated Spring Boot configuration code for team-finalized runtime and OpenAPI settings.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class OpenApiConfig {

    @Bean
    OpenAPI creditOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("FoC Credit Service")
                        .version("v1")
                        .description("Closed credit economy accounts and order reservations. Authenticate with a "
                                + "Firebase ID token."))
                .addServersItem(new Server().url("/"))
                .components(new Components().addSecuritySchemes("firebase", new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")
                        .description("Firebase ID token")))
                .addSecurityItem(new SecurityRequirement().addList("firebase"));
    }
}
