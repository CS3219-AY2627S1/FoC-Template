package sg.edu.nus.foc.credit.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/** Network trust is intentional: deploy with internal ingress and deny this path at the gateway. */
@Configuration(proxyBeanMethods = false)
@org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
@ConditionalOnProperty(name = "FOC_INTERNAL_ORDER_API_ENABLED", havingValue = "true")
public class InternalOrderSecurityConfiguration {
    @Bean
    @Order(0)
    SecurityFilterChain internalOrderSecurity(HttpSecurity http) throws Exception {
        return http.securityMatcher("/api/credits/internal/automatic-reposts/*/reservation",
                        "/api/credits/internal/automatic-reposts/*/funding-ready")
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
    }
}
