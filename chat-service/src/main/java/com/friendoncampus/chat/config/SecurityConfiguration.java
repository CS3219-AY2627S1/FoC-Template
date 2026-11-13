package com.friendoncampus.chat.config;

import java.util.Collection;
import java.util.List;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
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

import com.friendoncampus.chat.web.error.ProblemSecurityHandler;

@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(JwtResourceServerProperties.class)
public class SecurityConfiguration {

    @Bean
    ServiceTokens serviceTokens(@Value("${app.service-auth.trusted-keys}") String trust,
            @Value("${app.service-auth.key-id}") String kid,
            @Value("${app.service-auth.private-key}") String key) {
        return new ServiceTokens("chat-service", "chat-service", kid, key, trust);
    }

    @Bean @Order(1)
    SecurityFilterChain internalSecurityFilterChain(HttpSecurity http, ServiceTokens tokens,
            ProblemSecurityHandler errors) throws Exception {
        http.securityMatcher("/internal/**")
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/internal/chat/orders/*/report-eligibility",
                                "/internal/chat/cases/*/messages/*/attachment", "/internal/chat/cases/*/timeline", "/internal/chat/cases/*/conversations").authenticated()
                        .requestMatchers(HttpMethod.POST, "/internal/chat/cases/*/conversations").authenticated()
                        .anyRequest().denyAll())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .authenticationEntryPoint(errors).accessDeniedHandler(errors)
                        .jwt(jwt -> jwt.decoder(raw -> tokens.decode(raw, java.util.Set.of("admin-service")))))
                .exceptionHandling(ex -> ex.authenticationEntryPoint(errors).accessDeniedHandler(errors));
        return http.build();
    }

    @Bean @Order(2)
    SecurityFilterChain securityFilterChain(HttpSecurity http, @Qualifier("userJwtDecoder") JwtDecoder jwtDecoder,
            JwtAuthenticationConverter converter, ProblemSecurityHandler errors, com.friendoncampus.chat.authorization.CurrentAuthorization current) throws Exception {
        http
                .addFilterAfter(new com.friendoncampus.chat.authorization.CurrentAuthorizationFilter(current), org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter.class)
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/ws/chat", "/ws/chat/**").permitAll()
                        .requestMatchers("/error").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/chat/preferences", "/api/chat/quick-replies")
                        .authenticated()
                        .requestMatchers(HttpMethod.PUT, "/api/chat/preferences").authenticated()
                        .requestMatchers("/api/chat/**").authenticated()
                        .anyRequest().denyAll())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .authenticationEntryPoint(errors)
                        .accessDeniedHandler(errors)
                        .jwt(jwt -> jwt.decoder(jwtDecoder).jwtAuthenticationConverter(converter)))
                .exceptionHandling(ex -> ex.authenticationEntryPoint(errors).accessDeniedHandler(errors));
        return http.build();
    }

    @Bean
    JwtDecoder userJwtDecoder(JwtResourceServerProperties properties) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(properties.jwkSetUri().toString())
                .jwsAlgorithm(SignatureAlgorithm.RS256)
                .build();
        decoder.setJwtValidator(new JwtContractValidator(properties));
        return decoder;
    }

    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(SecurityConfiguration::authoritiesFor);
        return converter;
    }

    private static Collection<GrantedAuthority> authoritiesFor(Jwt jwt) {
        String role = jwt.getClaimAsString("role");
        return role == null ? List.of() : List.of(new SimpleGrantedAuthority("ROLE_" + role));
    }
}
