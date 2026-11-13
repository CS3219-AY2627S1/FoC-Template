package com.cs3219.foc.user.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Profile;

@Profile("admin-init")
@ConfigurationProperties("initial-admin")
public record InitialAdminProperties(String email, String name, String password) {}
