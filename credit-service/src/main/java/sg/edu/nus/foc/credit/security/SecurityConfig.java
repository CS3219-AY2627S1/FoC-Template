/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Code generation.
 * Scope: Generated the security implementation from the team-finalized Firebase authentication, authorization, and CORS design.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.security;

import java.time.Clock;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.ObjectPostProcessor;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AuthenticationEntryPointFailureHandler;
import org.springframework.web.client.RestClient;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import sg.edu.nus.foc.credit.config.CreditProperties;
import sg.edu.nus.foc.credit.config.CreditPushProperties;
import sg.edu.nus.foc.credit.api.CreditCompensationController;
import sg.edu.nus.foc.credit.api.CreditOrderEventController;
import sg.edu.nus.foc.credit.api.CreditUserEventController;
import tools.jackson.databind.json.JsonMapper;

@Configuration(proxyBeanMethods = false)
@EnableMethodSecurity
class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);
    private static final String GOOGLE_OIDC_JWK_SET_URI = "https://www.googleapis.com/oauth2/v3/certs";

    static final String[] PUBLIC_PATHS = {
            "/actuator/health", "/actuator/health/**", "/actuator/info",
            "/api/credits/docs", "/api/credits/docs/**",
            "/api/credits/v3/api-docs", "/api/credits/v3/api-docs/**",
            "/api/credits/swagger-ui/**", "/error"
    };

    @Bean
    @Order(1)
    SecurityFilterChain pubSubPushSecurityFilterChain(HttpSecurity http,
                                                       JsonSecurityHandlers handlers,
                                                       CreditPushProperties properties,
                                                       CreditProperties creditProperties,
                                                       @Value("${CREDIT_PUBSUB_PUSH_MODE:google}") String pushMode,
                                                       @Value("${PUBSUB_EMULATOR_HOST:}") String emulatorHost,
                                                       @Value("${FOC_ENVIRONMENT:local}") String environment) throws Exception {
        if (emulatorPushEnabled(pushMode, emulatorHost, environment, creditProperties, properties)) {
            // Local emulator sends unsigned HTTP push; only these explicitly configured
            // event paths are exempt. Firebase auth on all user APIs is unchanged.
            http.securityMatcher(CreditOrderEventController.OPEN_REFUND_PATH,
                            CreditOrderEventController.COMPLETION_PATH,
                            CreditCompensationController.PUSH_PATH,
                            CreditUserEventController.USER_CREATED_PATH)
                    .csrf(AbstractHttpConfigurer::disable)
                    .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                    .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
            log.warn("Unsigned Pub/Sub push enabled ONLY for explicitly configured local emulators.");
            return http.build();
        }
        http
                .securityMatcher(
                        CreditOrderEventController.OPEN_REFUND_PATH,
                        CreditOrderEventController.COMPLETION_PATH,
                        CreditCompensationController.PUSH_PATH,
                            CreditUserEventController.USER_CREATED_PATH)
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                .oauth2ResourceServer(oauth -> oauth
                        // Push service identities must not inherit Firebase user-role conversion.
                        .jwt(jwt -> jwt.decoder(pubSubPushJwtDecoder(properties))
                                .jwtAuthenticationConverter(new JwtAuthenticationConverter()))
                        .authenticationEntryPoint(handlers)
                        .accessDeniedHandler(handlers))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(handlers)
                        .accessDeniedHandler(handlers));
        return http.build();
    }

    boolean emulatorPushEnabled(String mode, String emulatorHost, String environment,
                                CreditProperties credit, CreditPushProperties push) {
        if ("google".equals(mode)) {
            if (!emulatorHost.isBlank()) {
                throw new IllegalStateException("Google push authentication must not receive emulator settings.");
            }
            return false;
        }
        if (!"emulator".equals(mode) || !"local".equals(environment)
                || emulatorHost.isBlank() || !credit.auth().usesEmulator()
                || !credit.auth().projectId().startsWith("demo-") || !push.projectId().startsWith("demo-")) {
            throw new IllegalStateException("Unsigned push requires explicit local mode and both demo emulators.");
        }
        return true;
    }

    @Bean
    @Order(2)
    SecurityFilterChain securityFilterChain(HttpSecurity http,
                                            JwtAuthenticationConverter jwtAuthenticationConverter,
                                            JsonSecurityHandlers handlers) throws Exception {
        AuthenticationEntryPointFailureHandler failureHandler = new AuthenticationEntryPointFailureHandler(handlers);
        failureHandler.setRethrowAuthenticationServiceException(false);

        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(PUBLIC_PATHS).permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth -> {
                    oauth.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter))
                            .authenticationEntryPoint(handlers)
                            .accessDeniedHandler(handlers);
                    oauth.addObjectPostProcessor(new ObjectPostProcessor<BearerTokenAuthenticationFilter>() {
                        @Override
                        public <O extends BearerTokenAuthenticationFilter> O postProcess(O filter) {
                            filter.setAuthenticationFailureHandler(failureHandler);
                            return filter;
                        }
                    });
                })
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(handlers)
                        .accessDeniedHandler(handlers));
        return http.build();
    }

    @Bean
    RoleProvider roleProvider(CreditProperties properties) {
        CreditProperties.UserServiceSettings userService = properties.userService();
        if (userService.mode() == CreditProperties.Mode.MOCK) {
            log.info("Resolving Credit Service roles with the mock User Service ({} admin email(s))",
                    userService.mockAdminEmails().size());
            return new MockUserServiceRoleProvider(userService.mockAdminEmails());
        }
        if (userService.baseUrl().isEmpty()) {
            throw new IllegalStateException("USER_SERVICE_URL is required when USER_SERVICE_MODE=http");
        }
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(userService.timeout());
        requestFactory.setReadTimeout(userService.timeout());
        return new HttpUserServiceRoleProvider(RestClient.builder()
                .baseUrl(userService.baseUrl())
                .requestFactory(requestFactory)
                .build());
    }

    @Bean
    FirebaseRoleAuthoritiesConverter firebaseRoleAuthoritiesConverter(RoleProvider roleProvider) {
        return new FirebaseRoleAuthoritiesConverter(roleProvider);
    }

    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter(FirebaseRoleAuthoritiesConverter authorities) {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);
        return converter;
    }

    JwtDecoder pubSubPushJwtDecoder(CreditPushProperties properties) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(GOOGLE_OIDC_JWK_SET_URI).build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefault(), new PubSubPushTokenValidator(properties)));
        return decoder;
    }

    @Bean
    JwtDecoder jwtDecoder(CreditProperties properties) {
        CreditProperties.AuthSettings auth = properties.auth();
        if (auth.usesEmulator()) {
            log.warn("Accepting unsigned Firebase Auth emulator tokens for project '{}'.", auth.projectId());
            return new EmulatorJwtDecoder(auth.projectId());
        }
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(FirebaseTokenValidators.GOOGLE_JWK_SET_URI).build();
        decoder.setJwtValidator(FirebaseTokenValidators.forProject(auth.projectId()));
        return decoder;
    }

    @Bean
    JsonSecurityHandlers jsonSecurityHandlers(JsonMapper mapper, Clock clock) {
        return new JsonSecurityHandlers(mapper, clock);
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(CreditProperties properties) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(properties.corsOrigins());
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Request-Id",
                "Idempotency-Key", "X-Command-Generation"));
        cors.setExposedHeaders(List.of("Idempotency-Key", "Command-Outcome"));
        cors.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);
        return source;
    }
}
