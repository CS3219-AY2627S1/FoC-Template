package com.friendoncampus.chat.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;

@Configuration
public class OpenApiConfiguration {

    @Bean
    OpenAPI chatOpenApi() {
        return new OpenAPI()
                .info(new Info().title("Friend on Campus Chat API").version("v1")
                        .description("Private errand conversations, preferences and live delivery."))
                .components(new Components().addSecuritySchemes("bearer-jwt", new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")
                        .description("User Service JWT; sub is the caller's user UUID.")));
    }
}
