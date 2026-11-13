package com.friendoncampus.notification.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;

@Configuration
public class OpenApiConfiguration {

    private static final String BEARER_JWT = "bearer-jwt";

    @Bean
    OpenAPI notificationOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Friend on Campus Notification API")
                        .version("v1")
                        .description("Reads the signed-in user's notifications about their errands and credits."))
                .components(new Components().addSecuritySchemes(BEARER_JWT, new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")
                        .description("User Service JWT; the 'sub' claim is the caller's user UUID.")));
    }
}
