package com.friendoncampus.admin;

import static org.junit.jupiter.api.Assertions.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.*;
import com.sun.net.httpserver.HttpServer;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jwt.*;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.JwtException;

class UserSignatureTest {
    @Test void validatesRealRs256AgainstUserJwksAndRejectsOtherSignersAndExpiredTokens() throws Exception {
        var generator = KeyPairGenerator.getInstance("RSA"); generator.initialize(2048);
        KeyPair user = generator.generateKeyPair(), other = generator.generateKeyPair();
        RSAKey jwk = new RSAKey.Builder((RSAPublicKey)user.getPublic()).keyID("user-key").build();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/jwks", exchange -> {
            byte[] body = new JWKSet(jwk).toString().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json"); exchange.sendResponseHeaders(200,body.length);
            try(var out = exchange.getResponseBody()) { out.write(body); }
        }); server.start();
        try {
            var decoder = new SecurityConfiguration().userJwtDecoder("http://127.0.0.1:"+server.getAddress().getPort()+"/jwks", "friend-on-campus-user-service","friend-on-campus-api");
            assertEquals("ADMIN", decoder.decode(token(user,60)).getClaimAsString("role"));
            assertThrows(JwtException.class, () -> decoder.decode(token(other,60)));
            assertThrows(JwtException.class, () -> decoder.decode(token(user,-120)));
        } finally { server.stop(0); }
    }
    String token(KeyPair key,int seconds) throws Exception {
        var now = Instant.now();
        var claims = new JWTClaimsSet.Builder().issuer("friend-on-campus-user-service").audience("friend-on-campus-api")
                .subject(UUID.randomUUID().toString()).claim("role","ADMIN").issueTime(Date.from(now.minusSeconds(300)))
                .expirationTime(Date.from(now.plusSeconds(seconds))).build();
        var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("user-key").build(),claims);
        jwt.sign(new RSASSASigner(key.getPrivate())); return jwt.serialize();
    }
}
