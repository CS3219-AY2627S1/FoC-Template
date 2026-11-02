/* AI Assistance Disclosure: OpenAI Codex, 2026-10-29. Separate Google push identity validation; review pending. */
package sg.edu.nus.foc.reporting.resolution;

import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods=false)
public class ReportPushSecurity {
    @Bean @Order(1)
    SecurityFilterChain reportPush(HttpSecurity http, ResolutionSettings settings, sg.edu.nus.foc.reporting.security.JsonSecurityHandlers handlers) throws Exception {
        http.securityMatcher(ReportResolutionController.PUSH).csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(e -> e.authenticationEntryPoint(handlers).accessDeniedHandler(handlers));
        if (!settings.enabled()) http.authorizeHttpRequests(a -> a.anyRequest().denyAll());
        else if (settings.emulatorPush()) http.authorizeHttpRequests(a -> a.anyRequest().permitAll());
        else {
            var decoder = NimbusJwtDecoder.withJwkSetUri("https://www.googleapis.com/oauth2/v3/certs").build();
            decoder.setJwtValidator(validator(settings));
            http.authorizeHttpRequests(a -> a.anyRequest().authenticated())
                    .oauth2ResourceServer(o -> o.jwt(j -> j.decoder(decoder)).authenticationEntryPoint(handlers).accessDeniedHandler(handlers));
        }
        return http.build();
    }
    static OAuth2TokenValidator<Jwt> validator(ResolutionSettings settings) {
        return new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(), jwt -> {
                boolean valid = jwt.getExpiresAt() != null && jwt.getIssuer() != null && java.util.Set.of("https://accounts.google.com", "accounts.google.com")
                        .contains(jwt.getIssuer().toString()) && jwt.getAudience().contains(settings.audience())
                        && settings.account().equals(jwt.getClaimAsString("email"))
                        && Boolean.TRUE.equals(jwt.getClaimAsBoolean("email_verified"));
                return valid ? OAuth2TokenValidatorResult.success() : OAuth2TokenValidatorResult.failure(
                        new OAuth2Error("invalid_token", "Report compensation push identity is invalid", null));
            });
    }
}
