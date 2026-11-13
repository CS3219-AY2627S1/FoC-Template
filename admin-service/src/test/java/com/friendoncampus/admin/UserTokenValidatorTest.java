package com.friendoncampus.admin;

import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class UserTokenValidatorTest {
    final UserTokenValidator validator = new UserTokenValidator("friend-on-campus-user-service", "friend-on-campus-api");
    Jwt token(String issuer, String audience, String sub, String role, int expiry) {
        return Jwt.withTokenValue("token").header("alg", "RS256").header("kid", "user-key").issuer(issuer)
                .subject(sub).audience(List.of(audience)).claim("role", role).issuedAt(Instant.now().minusSeconds(300))
                .expiresAt(Instant.now().plusSeconds(expiry)).build();
    }
    @Test void enforcesIssuerAudienceSubjectRoleAndExpiry() {
        String id = UUID.randomUUID().toString();
        assertFalse(validator.validate(token("friend-on-campus-user-service","friend-on-campus-api",id,"ADMIN",60)).hasErrors());
        assertTrue(validator.validate(token("wrong","friend-on-campus-api",id,"ADMIN",60)).hasErrors());
        assertTrue(validator.validate(token("friend-on-campus-user-service","wrong",id,"ADMIN",60)).hasErrors());
        assertTrue(validator.validate(token("friend-on-campus-user-service","friend-on-campus-api","broken","ADMIN",60)).hasErrors());
        assertTrue(validator.validate(token("friend-on-campus-user-service","friend-on-campus-api",id,"USER",60)).hasErrors());
        assertTrue(validator.validate(token("friend-on-campus-user-service","friend-on-campus-api",id,"ADMIN",-120)).hasErrors());
    }
}
