package com.friendoncampus.user.support;

import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.util.Base64;

import org.springframework.test.context.DynamicPropertyRegistry;

public final class JwtTestProperties {
    private static final String PRIVATE_KEY = generatePrivateKey();

    private JwtTestProperties() {
    }

    public static void register(DynamicPropertyRegistry registry) {
        registry.add("app.jwt.issuer", () -> "friend-on-campus-user-service");
        registry.add("app.jwt.audience", () -> "friend-on-campus-api");
        registry.add("app.jwt.access-token-ttl", () -> "PT15M");
        registry.add("app.jwt.key-id", () -> "user-service-rs256-1");
        registry.add("app.jwt.private-key", () -> PRIVATE_KEY);
    }

    private static String generatePrivateKey() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            PrivateKey privateKey = generator.generateKeyPair().getPrivate();
            return Base64.getEncoder().encodeToString(privateKey.getEncoded());
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to generate test JWT key", exception);
        }
    }
}
