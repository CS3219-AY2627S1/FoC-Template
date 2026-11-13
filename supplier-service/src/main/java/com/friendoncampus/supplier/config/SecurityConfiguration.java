package com.friendoncampus.supplier.config;

import java.net.URI;
import java.util.Collection;
import java.util.List;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.ObjectMapper;

@Configuration
@EnableConfigurationProperties(JwtResourceServerProperties.class)
public class SecurityConfiguration {

    @Bean
    JwtDecoder jwtDecoder(JwtResourceServerProperties properties) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withJwkSetUri(properties.jwkSetUri().toString())
                .jwsAlgorithm(SignatureAlgorithm.RS256)
                .build();

        decoder.setJwtValidator(new JwtContractValidator(properties));
        return decoder;
    }

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtDecoder jwtDecoder,
            ObjectMapper objectMapper, com.friendoncampus.supplier.authorization.CurrentAuthorization current) throws Exception {
        AuthenticationEntryPoint authenticationEntryPoint = (request, response, exception) -> {
            response.setHeader("WWW-Authenticate", "Bearer");
            writeProblem(
                    response,
                    request,
                    objectMapper,
                    HttpStatus.UNAUTHORIZED,
                    "Unauthorized",
                    "A valid bearer token is required");
        };
        AccessDeniedHandler accessDeniedHandler = (request, response, exception) -> writeProblem(
                response,
                request,
                objectMapper,
                HttpStatus.FORBIDDEN,
                "Forbidden",
                "Administrator access is required");

        return http
                .addFilterAfter(new com.friendoncampus.supplier.authorization.CurrentAuthorizationFilter(current), org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter.class)
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(
                                "/", "/index.html", "/assets/**", "/supplier-assets/**",
                                "/suppliers", "/suppliers/**",
                                "/admin/suppliers", "/admin/suppliers/**",
                                "/actuator/health",
                                "/v3/api-docs/**", "/v3/api-docs.yaml",
                                "/swagger-ui/**", "/swagger-ui.html")
                        .permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/suppliers", "/api/suppliers/**")
                        .permitAll()
                        .requestMatchers("/api/admin/suppliers", "/api/admin/suppliers/**")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/suppliers")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/suppliers/**")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/suppliers/**")
                        .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/suppliers/**")
                        .hasRole("ADMIN")
                        .anyRequest()
                        .denyAll())
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .jwt(jwt -> jwt
                                .decoder(jwtDecoder)
                                .jwtAuthenticationConverter(jwtAuthenticationConverter())))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .build();
    }

    private JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(this::authoritiesFor);
        return converter;
    }

    private Collection<GrantedAuthority> authoritiesFor(Jwt jwt) {
        return List.of(new SimpleGrantedAuthority("ROLE_" + jwt.getClaimAsString("role")));
    }

    private static void writeProblem(
            HttpServletResponse response,
            HttpServletRequest request,
            ObjectMapper objectMapper,
            HttpStatus status,
            String title,
            String detail) throws java.io.IOException {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        problem.setInstance(URI.create(request.getRequestURI()));

        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(), problem);
    }
}
