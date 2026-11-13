package sg.edu.nus.foc.order.config;

import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.web.config.PageableHandlerMethodArgumentResolverCustomizer;
import org.springframework.http.HttpMethod;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.ObjectPostProcessor;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AuthenticationEntryPointFailureHandler;
import org.springframework.web.client.RestClient;
import sg.edu.nus.foc.order.security.EmulatorJwtDecoder;
import sg.edu.nus.foc.order.security.FirebaseRoleAuthoritiesConverter;
import sg.edu.nus.foc.order.security.FirebaseTokenValidators;
import sg.edu.nus.foc.order.security.HttpUserServiceRoleProvider;
import sg.edu.nus.foc.order.security.JsonSecurityHandlers;
import sg.edu.nus.foc.order.security.MockUserServiceRoleProvider;
import sg.edu.nus.foc.order.security.RoleProvider;
import tools.jackson.databind.json.JsonMapper;

/** Local-open and production-authenticated security profiles for Order Service. */
@Configuration(proxyBeanMethods = false)
@SecurityScheme(name = "bearerAuth", type = SecuritySchemeType.HTTP, scheme = "bearer", bearerFormat = "JWT")
public class SecurityConfiguration {
    private static final Logger LOGGER = LoggerFactory.getLogger(SecurityConfiguration.class);

    private static final String[] PUBLIC_PATHS = {
        "/actuator/health", "/actuator/health/**", "/actuator/info",
        "/api/orders/docs", "/api/orders/docs/**", "/api/orders/v3/api-docs", "/api/orders/v3/api-docs/**",
        "/api/orders/swagger-ui/**", "/webjars/**", "/error"
    };

    @Bean
    @org.springframework.core.annotation.Order(0)
    @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "FOC_INTERNAL_ORDER_API_ENABLED", havingValue = "true")
    SecurityFilterChain internalOrderQueries(HttpSecurity http) throws Exception {
        return http.securityMatcher("/api/orders/internal/users/*/can-delete",
                        "/api/orders/internal/users/*/deletion-preparations/*")
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
    }

    @Bean
    @Profile("!prod")
    SecurityFilterChain localSecurity(HttpSecurity http) throws Exception {
        return http.csrf(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .build();
    }

    @Bean
    @Profile("prod")
    SecurityFilterChain productionSecurity(
            HttpSecurity http,
            JwtAuthenticationConverter jwtAuthenticationConverter,
            JsonSecurityHandlers handlers) throws Exception {
        AuthenticationEntryPointFailureHandler failureHandler = new AuthenticationEntryPointFailureHandler(handlers);
        failureHandler.setRethrowAuthenticationServiceException(false);

        http.csrf(AbstractHttpConfigurer::disable)
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
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint(handlers)
                        .accessDeniedHandler(handlers));
        return http.build();
    }

    @Bean
    @org.springframework.context.annotation.Primary
    @Profile("prod")
    JwtDecoder jwtDecoder(
            @Value("${order.security.auth.project-id:demo-foc}") String projectId,
            @Value("${order.security.auth.emulator-host:}") String emulatorHost) {
        if (!emulatorHost.isBlank()) {
            LOGGER.warn("Accepting Firebase Auth emulator tokens for project '{}'; do not configure this in production.",
                    projectId);
            return new EmulatorJwtDecoder(projectId);
        }
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(FirebaseTokenValidators.GOOGLE_JWK_SET_URI).build();
        decoder.setJwtValidator(FirebaseTokenValidators.forProject(projectId));
        return decoder;
    }

    @Bean
    @Profile("prod")
    RoleProvider roleProvider(
            @Value("${order.security.user-service.mode:mock}") String mode,
            @Value("${order.security.user-service.base-url:http://localhost:8081}") String baseUrl,
            @Value("${order.security.user-service.mock-admin-emails:}") String adminEmails,
            @Value("${order.security.user-service.timeout:3s}") Duration timeout,
            RestClient.Builder restClientBuilder) {
        if ("mock".equalsIgnoreCase(mode.strip())) {
            List<String> emails = Arrays.stream(adminEmails.split(","))
                    .map(String::strip)
                    .filter(email -> !email.isEmpty())
                    .toList();
            LOGGER.info("Resolving Order Service roles through local mock User Service ({} configured admin emails).",
                    emails.size());
            return new MockUserServiceRoleProvider(emails);
        }
        if (!"http".equalsIgnoreCase(mode.strip())) {
            throw new IllegalStateException("USER_SERVICE_MODE must be mock or http");
        }
        if (baseUrl.isBlank()) {
            throw new IllegalStateException("USER_SERVICE_URL is required when USER_SERVICE_MODE=http");
        }
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(timeout);
        requestFactory.setReadTimeout(timeout);
        return new HttpUserServiceRoleProvider(restClientBuilder
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .build());
    }

    @Bean
    @Profile("prod")
    FirebaseRoleAuthoritiesConverter firebaseRoleAuthoritiesConverter(RoleProvider roleProvider) {
        return new FirebaseRoleAuthoritiesConverter(roleProvider);
    }

    @Bean
    @Profile("prod")
    JwtAuthenticationConverter jwtAuthenticationConverter(FirebaseRoleAuthoritiesConverter authoritiesConverter) {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authoritiesConverter);
        return converter;
    }

    @Bean
    @Profile("prod")
    JsonSecurityHandlers jsonSecurityHandlers(JsonMapper mapper) {
        return new JsonSecurityHandlers(mapper);
    }

    @Bean
    PageableHandlerMethodArgumentResolverCustomizer pageableResolverCustomizer() {
        return resolver -> {
            resolver.setOneIndexedParameters(true);
            resolver.setMaxPageSize(100);
            resolver.setFallbackPageable(PageRequest.of(0, 20));
        };
    }
}
