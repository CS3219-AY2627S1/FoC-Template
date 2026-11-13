package com.friendoncampus.user.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;

@Configuration
public class OpenApiConfiguration {

    @Bean
    OpenAPI userOpenApi() {
        return new OpenAPI()
                .components(new Components().addSecuritySchemes("bearerAuth", new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")))
                .info(new Info()
                        .title("Friend on Campus User API")
                        .version("v1")
                        .description("D2 User Service: NUS-email registration and verification, login, password reset, "
                                + "profile management, Requester/Courier/Admin session-role selection, and administrator role/lifecycle controls. First-admin "
                                + "bootstrap is deployment-only, not an HTTP endpoint. Publishes RS256 public keys "
                                + "at /.well-known/jwks.json."));
    }
}
