package com.friendoncampus.supplier.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;

class JwtDecoderIntegrationTest {

    private static final String ISSUER = "friend-on-campus-user-service";
    private static final String AUDIENCE = "friend-on-campus-api";
    private static final String KEY_ID = "test-user-service-key";

    private static HttpServer jwksServer;
    private static KeyPair signingKey;
    private static JwtDecoder decoder;

    @BeforeAll
    static void setUpDecoder() throws Exception {
        signingKey = rsaKeyPair();
        RSAKey publicJwk = new RSAKey.Builder((RSAPublicKey) signingKey.getPublic())
                .keyID(KEY_ID)
                .build();
        byte[] jwks = new JWKSet(publicJwk).toString().getBytes(StandardCharsets.UTF_8);

        jwksServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        jwksServer.createContext("/.well-known/jwks.json", exchange -> {
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, jwks.length);
            exchange.getResponseBody().write(jwks);
            exchange.close();
        });
        jwksServer.start();

        URI jwksUri = URI.create("http://127.0.0.1:" + jwksServer.getAddress().getPort()
                + "/.well-known/jwks.json");
        decoder = new SecurityConfiguration().jwtDecoder(
                new JwtResourceServerProperties(jwksUri, ISSUER, AUDIENCE));
    }

    @AfterAll
    static void stopJwksServer() {
        if (jwksServer != null) {
            jwksServer.stop(0);
        }
    }

    @Test
    void verifiesAValidRs256UserServiceToken() throws Exception {
        String token = token(signingKey, ISSUER, List.of(AUDIENCE), "ADMIN", validTimes());

        assertThat(decoder.decode(token).getClaimAsString("role")).isEqualTo("ADMIN");
    }

    @Test
    void rejectsATokenWithAnInvalidSignature() throws Exception {
        String token = token(rsaKeyPair(), ISSUER, List.of(AUDIENCE), "ADMIN", validTimes());

        assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsInvalidContractClaims() throws Exception {
        TokenTimes validTimes = validTimes();
        assertThatThrownBy(() -> decoder.decode(
                token(signingKey, "another-service", List.of(AUDIENCE), "ADMIN", validTimes)))
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(
                token(signingKey, ISSUER, List.of("another-api"), "ADMIN", validTimes)))
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(
                token(signingKey, ISSUER, List.of(AUDIENCE), null, validTimes)))
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(
                token(signingKey, ISSUER, List.of(AUDIENCE), "SUPER_ADMIN", validTimes)))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsExpiredAndNotYetValidTokens() throws Exception {
        Instant now = Instant.now();
        TokenTimes expired = new TokenTimes(now.minusSeconds(300), now.minusSeconds(120), now.minusSeconds(300));
        TokenTimes future = new TokenTimes(now, now.plusSeconds(600), now.plusSeconds(300));

        assertThatThrownBy(() -> decoder.decode(
                token(signingKey, ISSUER, List.of(AUDIENCE), "ADMIN", expired)))
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(
                token(signingKey, ISSUER, List.of(AUDIENCE), "ADMIN", future)))
                .isInstanceOf(JwtException.class);
    }

    private static String token(
            KeyPair keyPair,
            String issuer,
            List<String> audience,
            String role,
            TokenTimes times) throws Exception {
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer(issuer)
                .subject("722d6da3-93f0-4a7d-9820-ab05047a9253")
                .audience(audience)
                .issueTime(Date.from(times.issuedAt()))
                .notBeforeTime(Date.from(times.notBefore()))
                .expirationTime(Date.from(times.expiresAt()));
        if (role != null) {
            claims.claim("role", role);
        }

        SignedJWT signedJwt = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(KEY_ID).build(),
                claims.build());
        signedJwt.sign(new RSASSASigner((RSAPrivateKey) keyPair.getPrivate()));
        return signedJwt.serialize();
    }

    private static KeyPair rsaKeyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        return generator.generateKeyPair();
    }

    private static TokenTimes validTimes() {
        Instant now = Instant.now();
        return new TokenTimes(now.minusSeconds(30), now.plusSeconds(600), now.minusSeconds(30));
    }

    private record TokenTimes(Instant issuedAt, Instant expiresAt, Instant notBefore) {
    }
}
