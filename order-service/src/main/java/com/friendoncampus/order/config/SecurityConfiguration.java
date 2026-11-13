package com.friendoncampus.order.config;

import java.util.Collection;
import java.util.List;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

import com.friendoncampus.order.web.error.ProblemSecurityHandler;

/**
 * Validates User Service RS256 JWTs against its published JWKS and derives the caller identity
 * from the verified {@code sub} claim. Identity is never taken from the request body or a header.
 * The single {@code role} claim is the caller's effective session role (see the service README).
 */
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(JwtResourceServerProperties.class)
public class SecurityConfiguration {

    @Bean @Order(2)
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtDecoder jwtDecoder,
            JwtAuthenticationConverter jwtAuthenticationConverter,
            ProblemSecurityHandler problemSecurityHandler, com.friendoncampus.order.authorization.CurrentAuthorization current) throws Exception {
        http
                .addFilterAfter(new com.friendoncampus.order.authorization.CurrentAuthorizationFilter(current), org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter.class)
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        // Outbox backlog and other service metrics are operator data.
                        .requestMatchers(HttpMethod.GET, "/actuator/metrics", "/actuator/metrics/**").hasRole("ADMIN")
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        // Error dispatches must reach the error page, or a 500 would surface as 403.
                        .requestMatchers("/error").permitAll()
                        // The packaged errand UI; the API it calls is protected below.
                        .requestMatchers(HttpMethod.GET, "/errands", "/errands/**", "/order-assets/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/orders").hasRole("REQUESTER")
                        .requestMatchers(HttpMethod.PATCH, "/api/orders/*").hasRole("REQUESTER")
                        .requestMatchers(HttpMethod.POST, "/api/orders/*/cancel", "/api/orders/*/complete")
                        .hasRole("REQUESTER")
                        .requestMatchers(HttpMethod.POST, "/api/orders/*/accept", "/api/orders/*/withdraw",
                                "/api/orders/*/pickup", "/api/orders/*/deliver")
                        .hasRole("COURIER")
                        // Read-only support views of another user's orders.
                        .requestMatchers(HttpMethod.GET, "/api/orders/admin/**").hasRole("ADMIN")
                        .requestMatchers("/api/orders/admin/**").denyAll()
                        .requestMatchers("/api/orders", "/api/orders/**").authenticated()
                        .anyRequest().denyAll())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .authenticationEntryPoint(problemSecurityHandler)
                        .accessDeniedHandler(problemSecurityHandler)
                        .jwt(jwt -> jwt
                                .decoder(jwtDecoder)
                                .jwtAuthenticationConverter(jwtAuthenticationConverter)))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(problemSecurityHandler)
                        .accessDeniedHandler(problemSecurityHandler));
        return http.build();
    }

    /** RS256-only decoder keyed by the User Service JWKS and checked against the token contract. */
    @Bean
    public JwtDecoder jwtDecoder(JwtResourceServerProperties properties) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withJwkSetUri(properties.jwkSetUri().toString())
                .jwsAlgorithm(SignatureAlgorithm.RS256)
                .build();
        decoder.setJwtValidator(new JwtContractValidator(properties));
        return decoder;
    }

    /**
     * Maps the single {@code role} claim to a {@code ROLE_*} authority; the principal name stays
     * the {@code sub} claim.
     */
    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(SecurityConfiguration::authoritiesFor);
        return converter;
    }

    private static Collection<GrantedAuthority> authoritiesFor(Jwt jwt) {
        String role = jwt.getClaimAsString("role");
        return role == null ? List.of() : List.of(new SimpleGrantedAuthority("ROLE_" + role));
    }
}
