package com.friendoncampus.user.config;

import static org.junit.jupiter.api.Assertions.*;
import java.security.*;
import java.util.*;
import java.time.Instant;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.*;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.BadJwtException;

class ServiceTokensTest {
    private final KeyPair pair = keys();
    private final String trust = "{\"key-1\":{\"subject\":\"chat-service\",\"publicKey\":\"" + Base64.getEncoder().encodeToString(pair.getPublic().getEncoded()) + "\"}}";
    private final ServiceTokens receiver = new ServiceTokens("admin-service", "admin-service", "", "", trust);
    private static KeyPair keys() { try { var g = KeyPairGenerator.getInstance("RSA"); g.initialize(2048); return g.generateKeyPair(); } catch(Exception e) { throw new RuntimeException(e); } }

    @Test void acceptsCorrectServiceAndAudience() {
        var sender = new ServiceTokens("chat-service", "chat-service", "key-1", Base64.getEncoder().encodeToString(pair.getPrivate().getEncoded()), "{}");
        assertEquals("chat-service", receiver.decode(sender.issue("admin-service"), Set.of("chat-service")).getSubject());
    }
    @Test void rejectsWrongAudienceSubjectKidExpiryLifetimeAndSignature() throws Exception {
        assertThrows(BadJwtException.class, () -> receiver.decode(token("chat-service", "user-service", "key-1", 60, -1, pair), Set.of("chat-service")));
        assertThrows(BadJwtException.class, () -> receiver.decode(token("credit-service", "admin-service", "key-1", 60, -1, pair), Set.of("chat-service", "credit-service")));
        assertThrows(BadJwtException.class, () -> receiver.decode(token("chat-service", "admin-service", "unknown", 60, -1, pair), Set.of("chat-service")));
        assertThrows(BadJwtException.class, () -> receiver.decode(token("chat-service", "admin-service", "key-1", -1, -30, pair), Set.of("chat-service")));
        assertThrows(BadJwtException.class, () -> receiver.decode(token("chat-service", "admin-service", "key-1", 120, -1, pair), Set.of("chat-service")));
        assertThrows(BadJwtException.class, () -> receiver.decode(token("chat-service", "admin-service", "key-1", 60, -1, keys()), Set.of("chat-service")));
        assertThrows(BadJwtException.class, () -> receiver.decode("broken", Set.of("chat-service")));
    }
    @Test void rejectsMissingJtiAndUserIssuer() throws Exception {
        for (String issuer : List.of("foc-service-auth", "friend-on-campus-user-service")) {
            var c = new JWTClaimsSet.Builder().issuer(issuer).subject("chat-service").audience("admin-service")
                    .issueTime(new Date()).expirationTime(Date.from(Instant.now().plusSeconds(30))).build();
            var t = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("key-1").build(), c);
            t.sign(new RSASSASigner(pair.getPrivate()));
            assertThrows(BadJwtException.class, () -> receiver.decode(t.serialize(), Set.of("chat-service")));
        }
    }
    private String token(String sub, String aud, String kid, int exp, int iat, KeyPair signer) throws Exception {
        Instant now = Instant.now();
        var c = new JWTClaimsSet.Builder().issuer("foc-service-auth").subject(sub).audience(aud).jwtID(UUID.randomUUID().toString())
                .issueTime(Date.from(now.plusSeconds(iat))).expirationTime(Date.from(now.plusSeconds(exp))).build();
        var t = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(kid).build(), c);
        t.sign(new RSASSASigner(signer.getPrivate())); return t.serialize();
    }
}
