package com.cs3219.foc.supplier.config;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class TimeConfig {
    // default use sg time zone
    public static final ZoneId CAMPUS_ZONE = ZoneId.of("Asia/Singapore");

    @Bean
    Clock clock() {
        return Clock.system(CAMPUS_ZONE);
    }
}
