/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.security;

import java.time.Clock;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.client.RestClient;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import sg.edu.nus.foc.reporting.config.ReportingProperties;
import tools.jackson.databind.json.JsonMapper;

@Configuration(proxyBeanMethods = false)
@EnableMethodSecurity
class SecurityConfig {
    private static final String[] PUBLIC = { "/actuator/health", "/actuator/health/**", "/actuator/info", "/api/reports/docs", "/api/reports/docs/**", "/api/reports/v3/api-docs", "/api/reports/v3/api-docs/**", "/api/reports/swagger-ui/**", "/error" };
    @Bean @org.springframework.core.annotation.Order(2)
    SecurityFilterChain security(HttpSecurity http, JwtAuthenticationConverter converter, JsonSecurityHandlers handlers) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable).cors(Customizer.withDefaults())
                .sessionManagement(value -> value.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll().requestMatchers(PUBLIC).permitAll().anyRequest().authenticated())
                .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.jwtAuthenticationConverter(converter)).authenticationEntryPoint(handlers).accessDeniedHandler(handlers))
                .exceptionHandling(value -> value.authenticationEntryPoint(handlers).accessDeniedHandler(handlers));
        return http.build();
    }
    @Bean JwtDecoder decoder(ReportingProperties properties) {
        if (properties.auth().usesEmulator()) return new EmulatorJwtDecoder(properties.auth().projectId());
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(FirebaseTokenValidators.JWK_URI).build();
        decoder.setJwtValidator(FirebaseTokenValidators.forProject(properties.auth().projectId())); return decoder;
    }
    @Bean RoleProvider roleProvider(ReportingProperties properties, Clock clock) {
        var settings = properties.userService();
        if (settings.mode() == ReportingProperties.Mode.MOCK) return new MockRoleProvider(settings.mockAdminEmails());
        if (settings.baseUrl().isEmpty()) throw new IllegalStateException("USER_SERVICE_URL is required when USER_SERVICE_MODE=http");
        var factory = new SimpleClientHttpRequestFactory(); factory.setConnectTimeout(settings.timeout()); factory.setReadTimeout(settings.timeout());
        RoleProvider provider = new HttpRoleProvider(RestClient.builder().baseUrl(settings.baseUrl()).requestFactory(factory).build());
        return settings.roleCacheTtl().isZero() ? provider : new CachingRoleProvider(provider, settings.roleCacheTtl(), clock);
    }
    @Bean JwtAuthenticationConverter converter() { var converter = new JwtAuthenticationConverter(); converter.setJwtGrantedAuthoritiesConverter(jwt -> List.of()); return converter; }
    @Bean JsonSecurityHandlers handlers(JsonMapper mapper, Clock clock) { return new JsonSecurityHandlers(mapper, clock); }
    @Bean CorsConfigurationSource cors(ReportingProperties properties) {
        var cors = new CorsConfiguration(); cors.setAllowedOrigins(properties.corsOrigins()); cors.setAllowedMethods(List.of("GET", "POST", "PATCH", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Request-Id")); cors.setMaxAge(3600L);
        var source = new UrlBasedCorsConfigurationSource(); source.registerCorsConfiguration("/**", cors); return source;
    }
}
