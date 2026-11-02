/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-31
 * Mode: Code generation.
 * Scope: Generated the security implementation from the team-finalized pub/sub subscription service and decoding of paths.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.security;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import sg.edu.nus.foc.user.config.UserPushProperties;

@Configuration(proxyBeanMethods = false)
@EnableMethodSecurity
public class SecurityConfig {

    private static final String GOOGLE_OIDC_JWK_SET_URI =
            "https://www.googleapis.com/oauth2/v3/certs";

    private static final String ADDITION_PATH =
            "/api/users/internal/penalties/addition";

    private static final String DEDUCTION_PATH =
            "/api/users/internal/penalties/deduction";

    private static final String[] PUBLIC_PATHS = {
            "/actuator/health", "/actuator/health/**", "/actuator/info",
            "/api/users/docs", "/api/users/docs/**",
            "/api/users/v3/api-docs", "/api/users/v3/api-docs/**",
            "/api/users/swagger-ui/**",
            "/error"
    };

    /**
     * Dedicated security chain for Pub/Sub push endpoints.
     */
    @Bean
    @Order(1)
    SecurityFilterChain pubSubPushSecurityFilterChain(
            HttpSecurity http,
            UserPushProperties properties,
            @Value("${USER_PUBSUB_PUSH_MODE:google}") String pushMode,
            @Value("${PUBSUB_EMULATOR_HOST:}") String emulatorHost,
            @Value("${FOC_ENVIRONMENT:local}") String environment)
            throws Exception {

        boolean emulatorEnabled = emulatorPushEnabled(
                pushMode, emulatorHost, environment);

        http.securityMatcher(ADDITION_PATH, DEDUCTION_PATH)
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session ->
                        session.sessionCreationPolicy(
                                SessionCreationPolicy.STATELESS));

        if (emulatorEnabled) {
            // Unsigned requests are permitted only for the local emulator.
            http.authorizeHttpRequests(auth ->
                    auth.anyRequest().permitAll());
        } else {
            if (properties.audience() == null
                    || properties.audience().isBlank()
                    || properties.serviceAccount() == null
                    || properties.serviceAccount().isBlank()) {
                throw new IllegalStateException(
                        "Pub/Sub audience and service account must be configured "
                        + "when Google push authentication is enabled.");
            }

            http.authorizeHttpRequests(auth ->
                            auth.anyRequest().authenticated())
                    .oauth2ResourceServer(oauth ->
                            oauth.jwt(jwt ->
                                    jwt.decoder(
                                            pubSubPushJwtDecoder(properties))));
        }

        return http.build();
    }

    /**
     * Allows unsigned push requests only when explicitly configured
     * for local Pub/Sub emulator development.
     */
    boolean emulatorPushEnabled(
            String mode,
            String emulatorHost,
            String environment) {

        if ("google".equals(mode)) {
            if (!emulatorHost.isBlank()) {
                throw new IllegalStateException(
                        "Google Pub/Sub push authentication must not "
                        + "use PUBSUB_EMULATOR_HOST.");
            }
            return false;
        }

        if (!"emulator".equals(mode)
                || !"local".equals(environment)
                || emulatorHost.isBlank()) {
            throw new IllegalStateException(
                    "Unsigned Pub/Sub push requires explicit local "
                    + "emulator mode and PUBSUB_EMULATOR_HOST.");
        }

        return true;
    }

    /**
     * Validates Google OIDC identity tokens from Pub/Sub.
     */
    JwtDecoder pubSubPushJwtDecoder(UserPushProperties properties) {

        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withJwkSetUri(GOOGLE_OIDC_JWK_SET_URI)
                .build();

        decoder.setJwtValidator(
                new DelegatingOAuth2TokenValidator<>(
                        JwtValidators.createDefault(),
                        new sg.edu.nus.foc.user.security.PubSubPushTokenValidator(
                                properties)));

        return decoder;
    }

    /**
     * Normal User Service security chain.
     * Firebase authentication remains unchanged.
     */
    @Bean
    @Order(2)
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            sg.edu.nus.foc.user.repository.UserRepository users)
            throws Exception {

        http.addFilterAfter(
                        new sg.edu.nus.foc.user.security.ActiveAccountFilter(users),
                        org.springframework.security.oauth2.server.resource.web.authentication
                                .BearerTokenAuthenticationFilter.class)
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(session ->
                        session.sessionCreationPolicy(
                                SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(PUBLIC_PATHS).permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth ->
                        oauth.jwt(jwt ->
                                jwt.jwtAuthenticationConverter(
                                        jwtAuthenticationConverter())));

        return http.build();
    }

    /**
     * Existing Firebase Auth decoder.
     */
    @Bean
    JwtDecoder jwtDecoder(
            @Value("${firebase.auth.project-id:demo-foc}") String projectId,
            @Value("${firebase.auth.emulator-host:}") String emulatorHost) {

        if (!emulatorHost.isBlank()) {
            return new sg.edu.nus.foc.user.security.EmulatorJwtDecoder(
                    projectId);
        }

        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withJwkSetUri(
                        sg.edu.nus.foc.user.security.FirebaseTokenValidators
                                .GOOGLE_JWK_SET_URI)
                .build();

        decoder.setJwtValidator(
                sg.edu.nus.foc.user.security.FirebaseTokenValidators
                        .forProject(projectId));

        return decoder;
    }

    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter =
                new JwtAuthenticationConverter();

        // Application roles come from User Service, not JWT claims.
        converter.setJwtGrantedAuthoritiesConverter(jwt -> List.of());

        return converter;
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${p28.userservice.cors-origins:"
                    + "http://localhost:3000,http://localhost:8080}")
            List<String> allowedOrigins) {

        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(allowedOrigins);
        cors.setAllowedMethods(
                List.of("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(
                List.of("Authorization", "Content-Type", "X-Request-Id"));
        cors.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source =
                new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);

        return source;
    }
}


