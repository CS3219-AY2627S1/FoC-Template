package sg.edu.nus.foc.order.config;

import java.util.List;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class OpenApiConfiguration {

    @Bean
    public OpenAPI orderOpenApi() {
        return new OpenAPI().servers(List.of(
                new Server().url("/").description("Current gateway or service origin")));
    }
}
