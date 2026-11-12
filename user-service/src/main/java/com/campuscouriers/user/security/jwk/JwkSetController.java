/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.security.jwk;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigInteger;
import java.security.PublicKey;
import java.security.interfaces.RSAPublicKey;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;

@RestController
public class JwkSetController {

    private final RSAPublicKey publicKey;
    private final String keyId;

    public JwkSetController(PublicKey publicKey, @Value("${app.jwt.key-id}") String keyId) {
        this.publicKey = (RSAPublicKey) publicKey;
        this.keyId = keyId;
    }

    @GetMapping("/.well-known/jwks.json")
    public JwkSet jwkSet() {
        return new JwkSet(List.of(new Jwk(
                "RSA", "sig", "RS256", keyId,
                encode(publicKey.getModulus()),
                encode(publicKey.getPublicExponent()))));
    }

    private static String encode(BigInteger value) {
        byte[] bytes = value.toByteArray();
        if (bytes.length > 1 && bytes[0] == 0) {
            bytes = Arrays.copyOfRange(bytes, 1, bytes.length);
        }
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

}
