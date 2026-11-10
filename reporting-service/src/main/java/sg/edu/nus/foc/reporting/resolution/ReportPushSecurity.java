/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated exact endpoint-specific Google push identity validation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.resolution;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.web.SecurityFilterChain;
import sg.edu.nus.foc.reporting.creation.*;
import sg.edu.nus.foc.reporting.security.JsonSecurityHandlers;

@Configuration(proxyBeanMethods = false)
public class ReportPushSecurity {
    @Bean
    @Order(1)
    SecurityFilterChain reportResolutionPush(HttpSecurity http, ResolutionSettings settings,
                                             JsonSecurityHandlers handlers) throws Exception {
        return endpoint(http, ReportResolutionController.PUSH, settings.enabled(), settings.emulatorPush(),
                settings.audience(), settings.account(), handlers);
    }

    @Bean
    @Order(2)
    SecurityFilterChain creationResultPush(HttpSecurity http, CreationSettings settings,
                                           JsonSecurityHandlers handlers) throws Exception {
        return endpoint(http, CreationCompensationResultController.PUSH, settings.enabled(),
                settings.emulatorPush(), settings.audience(), settings.account(), handlers);
    }

    @Bean
    @Order(3)
    SecurityFilterChain creationRecovery(HttpSecurity http, CreationSettings settings,
                                         JsonSecurityHandlers handlers) throws Exception {
        return endpoint(http, CreationRecoveryController.PATH, settings.enabled(), settings.emulatorPush(),
                settings.audience(), settings.schedulerAccount(), handlers);
    }

    private SecurityFilterChain endpoint(HttpSecurity http, String path, boolean enabled, boolean emulator,
                                         String audience, String account, JsonSecurityHandlers handlers) throws Exception {
        http.securityMatcher(path).csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(errors -> errors.authenticationEntryPoint(handlers).accessDeniedHandler(handlers));
        if (!enabled) {
            http.authorizeHttpRequests(auth -> auth.anyRequest().denyAll());
        } else if (emulator) {
            http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        } else {
            http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.decoder(decoder(audience, account)))
                            .authenticationEntryPoint(handlers).accessDeniedHandler(handlers));
        }
        return http.build();
    }

    private static JwtDecoder decoder(String audience, String account) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withJwkSetUri("https://www.googleapis.com/oauth2/v3/certs").build();
        decoder.setJwtValidator(validator(audience, account));
        return decoder;
    }

    static OAuth2TokenValidator<Jwt> validator(ResolutionSettings settings) {
        return validator(settings.audience(), settings.account());
    }

    static OAuth2TokenValidator<Jwt> validator(String audience, String account) {
        return new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(), jwt -> {
            boolean valid = jwt.getExpiresAt() != null && jwt.getIssuer() != null
                    && java.util.Set.of("https://accounts.google.com", "accounts.google.com")
                            .contains(jwt.getIssuer().toString())
                    && jwt.getAudience().contains(audience)
                    && account.equals(jwt.getClaimAsString("email"))
                    && Boolean.TRUE.equals(jwt.getClaimAsBoolean("email_verified"));
            return valid ? OAuth2TokenValidatorResult.success() : OAuth2TokenValidatorResult.failure(
                    new OAuth2Error("invalid_token", "Report push identity is invalid", null));
        });
    }
}
