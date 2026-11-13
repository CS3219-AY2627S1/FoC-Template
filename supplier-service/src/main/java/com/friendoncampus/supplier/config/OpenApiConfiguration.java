package com.friendoncampus.supplier.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;

@Configuration
public class OpenApiConfiguration {

    @Bean
    OpenAPI supplierOpenApi() {
        return new OpenAPI()
                .components(new Components().addSecuritySchemes(
                        "bearerAuth",
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("RS256 access token issued by Friend on Campus User Service")))
                .info(new Info()
                        .title("Friend on Campus Supplier API")
                        .version("v1")
                        .description("""
                                Manages campus suppliers for Friend on Campus. Public listings expose
                                active suppliers, while administrative listings expose active and
                                inactive suppliers. Administrative reads and all mutations require a
                                User Service JWT carrying the ADMIN role. Updates, status changes, and
                                deletion use the supplier version to prevent overwriting or deleting
                                unseen changes.
                                """));
    }
}
