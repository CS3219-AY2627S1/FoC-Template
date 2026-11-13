package sg.edu.nus.foc.supplier.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** OpenAPI docs at /api/suppliers/docs (Swagger UI) and /api/suppliers/v3/api-docs. */
@Configuration(proxyBeanMethods = false)
class OpenApiConfig {

    @Bean
    OpenAPI supplierOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("FoC Supplier Service")
                        .version("v1")
                        .description("Catalogue of campus pickup and delivery points. Authenticate with a Firebase "
                                + "ID token; catalogue management requires the admin role."))
                // Relative server URL so "Try it out" works directly and through the gateway.
                .addServersItem(new Server().url("/"))
                .components(new Components().addSecuritySchemes("firebase", new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")
                        .description("Firebase ID token")))
                .addSecurityItem(new SecurityRequirement().addList("firebase"));
    }
}
