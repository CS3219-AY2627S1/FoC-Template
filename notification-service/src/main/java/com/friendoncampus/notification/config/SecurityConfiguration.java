package com.friendoncampus.notification.config;

import java.util.Collection;
import java.util.List;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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

import com.friendoncampus.notification.web.error.ProblemSecurityHandler;

/**
 * Validates User Service RS256 JWTs against its published JWKS. The recipient of every read is the
 * verified {@code sub} claim; it is never taken from a parameter, body or header. Each endpoint is
 * listed with its method; everything else is denied. Notifications
 * belong to the account, not the session role, so every supported role may read its own.
 */
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(JwtResourceServerProperties.class)
public class SecurityConfiguration {

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtDecoder jwtDecoder,
            JwtAuthenticationConverter jwtAuthenticationConverter,
            ProblemSecurityHandler problemSecurityHandler) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        // Error dispatches must reach the error page, or a 500 would surface as 403.
                        .requestMatchers("/error").permitAll()
                        // The packaged Notifications UI; the API it calls is protected below.
                        .requestMatchers(HttpMethod.GET, "/notifications", "/notifications/**", "/notification-assets/**")
                        .permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/notifications/me", "/api/notifications/me/unread-count",
                                "/api/notifications/me/push")
                        .authenticated()
                        .requestMatchers(HttpMethod.PATCH, "/api/notifications/me/*/read").authenticated()
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
