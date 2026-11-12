/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.bootstrap;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.stream.Stream;

// Bound from BOOTSTRAP_ADMIN_NAME / BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD (see application.properties)
@ConfigurationProperties("app.bootstrap-admin")
public record AdminBootstrapProperties(String name, String email, String password) {

    boolean isUnset() {
        return values().allMatch(AdminBootstrapProperties::isBlank);
    }

    boolean isComplete() {
        return values().noneMatch(AdminBootstrapProperties::isBlank);
    }

    private Stream<String> values() {
        return Stream.of(name, email, password);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    // Never expose the password through logging or debugging output
    @Override
    public String toString() {
        return "AdminBootstrapProperties[name=" + name + ", email=" + email + ", password=****]";
    }

}
