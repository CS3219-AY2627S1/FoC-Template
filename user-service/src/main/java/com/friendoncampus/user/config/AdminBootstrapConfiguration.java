package com.friendoncampus.user.config;

import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.friendoncampus.user.service.AdminBootstrapService;

@Configuration
@EnableConfigurationProperties(AdminBootstrapProperties.class)
public class AdminBootstrapConfiguration {
    @Bean
    ApplicationRunner firstAdminBootstrap(AdminBootstrapService bootstrap) {
        return arguments -> bootstrap.bootstrap();
    }
}
