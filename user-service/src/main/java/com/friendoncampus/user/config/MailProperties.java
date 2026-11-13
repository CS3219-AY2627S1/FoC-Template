package com.friendoncampus.user.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.mail")
public record MailProperties(String provider, String sendgridApiKey, String fromEmail) {
}
