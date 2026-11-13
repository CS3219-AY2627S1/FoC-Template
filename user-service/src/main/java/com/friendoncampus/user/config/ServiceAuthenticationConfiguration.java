package com.friendoncampus.user.config;

import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.http.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import tools.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.security.SecurityScheme;

@Configuration
@SecurityScheme(name = "serviceBearer", type = SecuritySchemeType.HTTP, scheme = "bearer", bearerFormat = "Service JWT")
public class ServiceAuthenticationConfiguration {
    @Bean @Order(1)
    SecurityFilterChain internalUsers(HttpSecurity http, ObjectMapper mapper,
            @Value("${USER_SERVICE_TRUSTED_KEYS:{}}") String trust) throws Exception {
        ServiceTokens tokens = new ServiceTokens("user-service", "user-service", "", "", trust);
        return http.securityMatcher("/internal/**").csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.GET,"/internal/users/*/authorization").authenticated()
                        .requestMatchers(HttpMethod.GET,"/internal/users/*/admin-eligibility","/internal/users/admin-operations/*")
                        .access((authentication, context) -> new org.springframework.security.authorization.AuthorizationDecision(
                                authentication.get().isAuthenticated() && Set.of("admin-service","chat-service","credit-service").contains(authentication.get().getName())))
                        .anyRequest().denyAll())
                .oauth2ResourceServer(o -> o.authenticationEntryPoint((q,r,e) -> {
                    r.setStatus(401); r.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
                    mapper.writeValue(r.getOutputStream(), ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "A valid service assertion is required"));
                }).jwt(j -> j.decoder(raw -> tokens.decode(raw, Set.of("admin-service", "chat-service", "credit-service", "supplier-service", "order-service")))))
                .build();
    }
}
