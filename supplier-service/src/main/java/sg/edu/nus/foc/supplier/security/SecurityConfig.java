package sg.edu.nus.foc.supplier.security;

import java.time.Clock;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import sg.edu.nus.foc.supplier.config.SupplierProperties;
import tools.jackson.databind.json.JsonMapper;

/**
 * Authentication: every request needs a Firebase ID token (OAuth2 resource server, stateless).
 * Authorisation: roles come from the User Service, looked up only by endpoints that need them
 * ({@link CallerRoles}); admin-only endpoints use {@code @PreAuthorize}.
 */
@Configuration(proxyBeanMethods = false)
@EnableMethodSecurity
class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    static final String[] PUBLIC_PATHS = {
            "/actuator/health", "/actuator/health/**", "/actuator/info",
            "/api/suppliers/docs", "/api/suppliers/docs/**",
            "/api/suppliers/v3/api-docs", "/api/suppliers/v3/api-docs/**",
            "/api/suppliers/swagger-ui/**",
            // Spring's error dispatch: lets unexpected failures surface as 500 instead of a misleading 401.
            "/error",
    };

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, JwtAuthenticationConverter jwtAuthenticationConverter,
                                            JsonSecurityHandlers handlers) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable) // bearer tokens, no cookies
                .cors(Customizer.withDefaults())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(PUBLIC_PATHS).permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth -> oauth
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter))
                        .authenticationEntryPoint(handlers)
                        .accessDeniedHandler(handlers))
                .exceptionHandling(e -> e.authenticationEntryPoint(handlers).accessDeniedHandler(handlers));
        return http.build();
    }

    @Bean
    JwtDecoder jwtDecoder(SupplierProperties properties) {
        SupplierProperties.AuthSettings auth = properties.auth();
        if (auth.usesEmulator()) {
            log.warn("Accepting unsigned Firebase Auth EMULATOR tokens for project '{}'. Never enable in the cloud.",
                    auth.projectId());
            return new EmulatorJwtDecoder(auth.projectId());
        }
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(FirebaseTokenValidators.GOOGLE_JWK_SET_URI).build();
        decoder.setJwtValidator(FirebaseTokenValidators.forProject(auth.projectId()));
        return decoder;
    }

    @Bean
    RoleProvider roleProvider(SupplierProperties properties, Clock clock) {
        SupplierProperties.UserServiceSettings userService = properties.userService();
        if (userService.mode() == SupplierProperties.Mode.MOCK) {
            log.info("Resolving roles with the mock User Service ({} admin email(s))",
                    userService.mockAdminEmails().size());
            return new MockUserServiceRoleProvider(userService.mockAdminEmails());
        }
        if (userService.baseUrl().isEmpty()) {
            throw new IllegalStateException("USER_SERVICE_URL is required when USER_SERVICE_MODE=http");
        }
        log.info("Resolving roles with the User Service at {} (timeout {}, cache {})", userService.baseUrl(),
                userService.timeout(), userService.roleCacheTtl());
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(userService.timeout());
        requestFactory.setReadTimeout(userService.timeout());
        RoleProvider http = new HttpUserServiceRoleProvider(RestClient.builder()
                .baseUrl(userService.baseUrl())
                .requestFactory(requestFactory)
                .build());
        return userService.roleCacheTtl().isZero() ? http
                : new CachingRoleProvider(http, userService.roleCacheTtl(), clock);
    }

    /** Authorities stay empty: roles are resolved per endpoint by {@link CallerRoles}, not for every request. */
    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> List.of());
        return converter;
    }

    @Bean
    JsonSecurityHandlers jsonSecurityHandlers(JsonMapper mapper, Clock clock) {
        return new JsonSecurityHandlers(mapper, clock);
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(SupplierProperties properties) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(properties.corsOrigins());
        cors.setAllowedMethods(List.of("GET", "POST", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Request-Id"));
        cors.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);
        return source;
    }
}
