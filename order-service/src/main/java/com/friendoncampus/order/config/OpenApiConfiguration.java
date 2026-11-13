package com.friendoncampus.order.config;

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
    OpenAPI orderOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Friend on Campus Order API")
                        .version("v1")
                        .description("Manages Friend on Campus errand orders and their lifecycle."))
                .components(new Components().addSecuritySchemes(BEARER_JWT, new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")
                        .description("User Service JWT; the 'sub' claim is the caller's user UUID.")));
    }
}
