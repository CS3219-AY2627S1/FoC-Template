/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.security.access;

import com.campuscouriers.user.entity.Account;
import com.campuscouriers.user.entity.AccountType;
import com.campuscouriers.user.exception.InvalidAccessTokenException;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.convert.DurationStyle;
import org.springframework.stereotype.Service;

import java.security.PrivateKey;
import java.security.PublicKey;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

@Service
public class JwtService {

    private final PrivateKey privateKey;
    @Getter
    private final PublicKey publicKey;
    private final Clock clock;
    private final String issuer;
    @Getter
    private final Duration accessTokenTtl;
    private final String keyId;

    public JwtService(PrivateKey privateKey,
                      PublicKey publicKey,
                      Clock clock,
                      @Value("${app.jwt.issuer}") String issuer,
                      @Value("${app.jwt.access-token-ttl}") String accessTokenTtl,
                      @Value("${app.jwt.key-id}") String keyId) {
        this.privateKey = privateKey;
        this.publicKey = publicKey;
        this.clock = clock;
        this.issuer = issuer;
        this.accessTokenTtl = DurationStyle.detectAndParse(accessTokenTtl);
        this.keyId = keyId;
    }

    public String generateAccessToken(Account account) {
        Instant now = clock.instant();
        return Jwts.builder()
                .header().keyId(keyId).and()
                .subject(String.valueOf(account.getId()))
                .issuer(issuer)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(accessTokenTtl)))
                .claim("email", account.getEmail())
                .claim("type", account.getType().name())
                .signWith(privateKey, Jwts.SIG.RS256)
                .compact();
    }

    public AccessTokenClaims parseAndValidate(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(publicKey)
                    .requireIssuer(issuer)
                    .clock(() -> Date.from(clock.instant()))
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            String subject = claims.getSubject();
            String type = claims.get("type", String.class);

            return new AccessTokenClaims(
                    subject == null ? null : UUID.fromString(subject),
                    claims.get("email", String.class),
                    type == null ? null : AccountType.valueOf(type));
        } catch (JwtException | IllegalArgumentException e) {
            throw new InvalidAccessTokenException();
        }
    }
}
