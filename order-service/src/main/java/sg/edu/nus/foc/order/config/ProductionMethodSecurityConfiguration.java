package sg.edu.nus.foc.order.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;

/** Enables endpoint role checks only in the production security profile. */
@Configuration(proxyBeanMethods = false)
@Profile("prod")
@EnableMethodSecurity
public class ProductionMethodSecurityConfiguration {
}
