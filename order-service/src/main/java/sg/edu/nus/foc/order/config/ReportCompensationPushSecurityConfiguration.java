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
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import sg.edu.nus.foc.order.api.ReportCompensationResultController;
import sg.edu.nus.foc.order.security.CompensationPushTokenValidator;
import sg.edu.nus.foc.order.security.JsonSecurityHandlers;
import tools.jackson.databind.json.JsonMapper;

@Configuration(proxyBeanMethods = false)
@SecurityScheme(name = "reportPubSubPushAuth", type = SecuritySchemeType.HTTP, scheme = "bearer", bearerFormat = "Google OIDC")
@ConditionalOnProperty(name = "order.reports.resolution.enabled", havingValue = "true")
public class ReportCompensationPushSecurityConfiguration {
    @Bean("reportResolutionPushJwtDecoder")
    JwtDecoder decoder(ReportResolutionSettings settings) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri("https://www.googleapis.com/oauth2/v3/certs").build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(), new CompensationPushTokenValidator(settings.transport())));
        return decoder;
    }
    @Bean
    @Order(2)
    SecurityFilterChain reportResultSecurity(HttpSecurity http, ReportResolutionSettings settings,
            @Qualifier("reportResolutionPushJwtDecoder") JwtDecoder decoder, JsonMapper json) throws Exception {
        var handlers = new JsonSecurityHandlers(json);
        http.securityMatcher(ReportCompensationResultController.PATH).csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(e -> e.authenticationEntryPoint(handlers).accessDeniedHandler(handlers));
        if (settings.transport().emulator()) http.authorizeHttpRequests(a -> a.anyRequest().permitAll());
        else http.authorizeHttpRequests(a -> a.anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(j -> j.decoder(decoder).jwtAuthenticationConverter(new JwtAuthenticationConverter()))
                        .authenticationEntryPoint(handlers).accessDeniedHandler(handlers));
        return http.build();
    }
}
