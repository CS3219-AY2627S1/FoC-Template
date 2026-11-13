package com.friendoncampus.admin;

import java.net.URI;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.http.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.ObjectPostProcessor;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;
import jakarta.servlet.http.*;
import tools.jackson.databind.ObjectMapper;

@Configuration
@EnableWebSecurity
public class SecurityConfiguration {
    @Bean ServiceTokens serviceTokens(@Value("${app.service-auth.trusted-keys}") String trust,
            @Value("${app.service-auth.key-id}") String kid, @Value("${app.service-auth.private-key}") String key) {
        return new ServiceTokens("admin-service", "admin-service", kid, key, trust);
    }
    @Bean JwtDecoder userJwtDecoder(@Value("${app.user.jwk-set-uri}") String uri,
            @Value("${app.user.issuer}") String issuer, @Value("${app.user.audience}") String audience) {
        SimpleClientHttpRequestFactory requests = new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(2000);
        requests.setReadTimeout(3000);
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(uri).jwsAlgorithm(SignatureAlgorithm.RS256)
                .restOperations(new RestTemplate(requests)).build();
        decoder.setJwtValidator(new UserTokenValidator(issuer, audience));
        return decoder;
    }
    @Bean @Order(1) SecurityFilterChain internal(HttpSecurity http, ServiceTokens tokens, ObjectMapper mapper) throws Exception {
        common(http, mapper);
        return http.securityMatcher("/internal/**").authorizeHttpRequests(a -> a
                .requestMatchers(HttpMethod.GET, "/internal/admin/cases/*/access", "/internal/admin/orders/*/evidence").authenticated().anyRequest().denyAll())
                .oauth2ResourceServer(o -> o.authenticationEntryPoint((q,r,e) -> problem(r,q,mapper,401))
                        .jwt(j -> j.decoder(raw -> tokens.decode(raw, Set.of("chat-service")))))
                .build();
    }
    @Bean @Order(2) SecurityFilterChain publicApi(HttpSecurity http, JwtDecoder userJwtDecoder, ObjectMapper mapper, com.friendoncampus.admin.authorization.CurrentAuthorization current) throws Exception {
        common(http, mapper);
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> List.of(new SimpleGrantedAuthority("ROLE_" + jwt.getClaimAsString("role"))));
        return http.addFilterAfter(new com.friendoncampus.admin.authorization.CurrentAuthorizationFilter(current), org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter.class)
                .authorizeHttpRequests(a -> a
                .requestMatchers("/admin", "/admin/**", "/admin-assets/**", "/actuator/health", "/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/admin/session", "/api/admin/cases", "/api/admin/cases/*", "/api/admin/cases/*/messages/*/attachment", "/api/admin/cases/*/timeline", "/api/admin/cases/*/actions/*", "/api/admin/cases/*/conversations").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/admin/cases/*/claim", "/api/admin/cases/*/conversations", "/api/admin/cases/*/actions", "/api/admin/cases/*/resolve").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET,"/api/admin/orders/*/report-context", "/api/admin/reports/*/conversations").hasAnyRole("REQUESTER", "COURIER")
                .requestMatchers("/api/admin/reports", "/api/admin/reports/*").hasAnyRole("REQUESTER", "COURIER")
                .anyRequest().denyAll())
                .oauth2ResourceServer(o -> o.authenticationEntryPoint((q,r,e) -> problem(r,q,mapper,401))
                        .withObjectPostProcessor(new ObjectPostProcessor<BearerTokenAuthenticationFilter>() {
                            @Override public <O extends BearerTokenAuthenticationFilter> O postProcess(O filter) {
                                filter.setAuthenticationFailureHandler((q,r,e) -> problem(r,q,mapper,
                                        e instanceof AuthenticationServiceException ? 503 : 401));
                                return filter;
                            }
                        })
                        .jwt(j -> j.decoder(userJwtDecoder).jwtAuthenticationConverter(converter))).build();
    }
    private void common(HttpSecurity http, ObjectMapper mapper) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable).sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(e -> e.authenticationEntryPoint((q,r,x) -> problem(r,q,mapper,401))
                        .accessDeniedHandler((q,r,x) -> problem(r,q,mapper,403)));
        http.headers(h -> h.contentSecurityPolicy(c -> c.policyDirectives("default-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; frame-ancestors 'none'")));
    }
    static void problem(HttpServletResponse response, HttpServletRequest request, ObjectMapper mapper, int status) throws java.io.IOException {
        ProblemDetail p = ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(status), status == 503
                ? "Identity verification is temporarily unavailable" : status == 401 ? "A valid token is required" : "You cannot access this resource");
        p.setInstance(URI.create(request.getRequestURI()));
        response.setStatus(status); response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(), p);
    }
}
