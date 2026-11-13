package sg.edu.nus.foc.user.config;

import java.util.Arrays;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig {

    @Value("${CORS_ORIGINS:http://localhost:3000}")
    private String allowedOrigins;

    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/**")
                        .allowedOrigins(
                            Arrays.stream(allowedOrigins.split(","))
                                .map(String::trim)
                                .toArray(String[]::new)
                        )
                        .allowedMethods(
                            "GET", "POST", "PUT", "DELETE", "OPTIONS"
                        )
                        .allowedHeaders("*");
            }
        };
    }
}