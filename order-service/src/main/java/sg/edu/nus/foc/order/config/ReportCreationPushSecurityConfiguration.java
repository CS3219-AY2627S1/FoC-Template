/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation implementation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.order.config;

import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import sg.edu.nus.foc.order.api.ReportCreationCompensationController;
import sg.edu.nus.foc.order.security.JsonSecurityHandlers;
import sg.edu.nus.foc.order.security.ReportCreationPushTokenValidator;
import tools.jackson.databind.json.JsonMapper;

@Configuration(proxyBeanMethods = false)
@SecurityScheme(name = "reportCreationPubSubPushAuth", type = SecuritySchemeType.HTTP,
        scheme = "bearer", bearerFormat = "Google OIDC")
@ConditionalOnProperty(name = "order.reports.creation.enabled", havingValue = "true")
public class ReportCreationPushSecurityConfiguration {
    @Bean("reportCreationPushJwtDecoder")
    JwtDecoder decoder(ReportCreationSettings settings) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withJwkSetUri("https://www.googleapis.com/oauth2/v3/certs").build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(),
                new ReportCreationPushTokenValidator(settings)));
        return decoder;
    }

    @Bean
    @Order(3)
    SecurityFilterChain reportCreationPushSecurity(HttpSecurity http, ReportCreationSettings settings,
            @Qualifier("reportCreationPushJwtDecoder") JwtDecoder decoder, JsonMapper json) throws Exception {
        JsonSecurityHandlers handlers = new JsonSecurityHandlers(json);
        http.securityMatcher(ReportCreationCompensationController.PATH)
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(errors -> errors.authenticationEntryPoint(handlers).accessDeniedHandler(handlers));
        if (settings.emulator()) {
            http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        } else {
            http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.decoder(decoder)
                            .jwtAuthenticationConverter(new JwtAuthenticationConverter()))
                            .authenticationEntryPoint(handlers).accessDeniedHandler(handlers));
        }
        return http.build();
    }
}
