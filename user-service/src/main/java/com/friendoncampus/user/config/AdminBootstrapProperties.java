package com.friendoncampus.user.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.admin-bootstrap")
public record AdminBootstrapProperties(String email, String username, String password) {
    public boolean isRequested() {
        return hasText(email) || hasText(username) || hasText(password);
    }

    public void requireCompleteConfiguration() {
        if (!hasText(email) || !hasText(username) || !hasText(password)) {
            throw new IllegalStateException("ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_USERNAME, and ADMIN_BOOTSTRAP_PASSWORD must be set together");
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
