package sg.edu.nus.foc.user.config;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Injectable clock so time-dependent logic (cache expiry, opening hours) is testable. */
@Configuration(proxyBeanMethods = false)
public class ClockConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
