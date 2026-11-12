/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-11-06
 * Scope (AI-25): Generated Kubernetes manifests, health endpoints and probe settings from my deployment specification.
 * Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
 * Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-10-02
 * Scope: Generated initial access configuration, CORS/JWT rules, and admin authorization.
 */
package com.campuscouriers.supplier.config;

import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

// Only when running as a web app: the supplier-seed Job (k8s/jobs/supplier-seed.yaml) starts this
// application with no web server, where there are no HTTP requests to secure and no HttpSecurity bean
@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> { })
                .authorizeHttpRequests(requests -> requests
                        // Kubernetes probes and ALB health checks (not routed through the Ingress)
                        .requestMatchers(HttpMethod.GET, "/actuator/health", "/actuator/health/**")
                        .permitAll()
                        .requestMatchers(HttpMethod.GET,
                                "/suppliers/deactivated", "/categories/deactivated",
                                "/buildings/deactivated")
                        .hasAuthority("Administrator")
                        .requestMatchers(HttpMethod.GET,
                                "/suppliers/**", "/categories/**", "/buildings/**")
                        .authenticated()
                        .requestMatchers(HttpMethod.POST,
                                "/suppliers", "/categories", "/buildings")
                        .hasAuthority("Administrator")
                        .requestMatchers(HttpMethod.POST,
                                "/categories/*/deactivate", "/categories/*/reactivate",
                                "/buildings/*/deactivate", "/buildings/*/reactivate")
                        .hasAuthority("Administrator")
                        .requestMatchers(HttpMethod.PUT,
                                "/suppliers/**", "/categories/**", "/buildings/**")
                        .hasAuthority("Administrator")
                        .requestMatchers(HttpMethod.PATCH,
                                "/suppliers/*/deactivate", "/suppliers/*/reactivate")
                        .hasAuthority("Administrator")
                        .anyRequest().denyAll())
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())))
                .build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${supplier.cors.allowed-origins}") String allowedOrigins) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setExposedHeaders(List.of("Location"));
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter authoritiesConverter = new JwtGrantedAuthoritiesConverter();
        authoritiesConverter.setAuthoritiesClaimName("type");
        authoritiesConverter.setAuthorityPrefix("");

        JwtAuthenticationConverter authenticationConverter = new JwtAuthenticationConverter();
        authenticationConverter.setJwtGrantedAuthoritiesConverter(authoritiesConverter);
        return authenticationConverter;
    }
}
