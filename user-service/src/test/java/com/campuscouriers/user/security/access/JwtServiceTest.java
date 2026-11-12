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
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.convert.DurationStyle;
import org.springframework.test.util.ReflectionTestUtils;

import java.security.KeyPair;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

import static com.campuscouriers.user.TestConstants.VALID_EMAIL;
import static org.assertj.core.api.AssertionsForClassTypes.assertThat;
import static org.assertj.core.api.AssertionsForClassTypes.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class JwtServiceTest {

    @Mock
    private Clock clock;

    private final Instant now = Instant.parse("2026-09-24T10:00:00Z");

    private KeyPair keyPair;
    private JwtService jwtService;

    @BeforeEach
    void createService() {
        keyPair = Jwts.SIG.RS256.keyPair().build();
        jwtService = new JwtService(keyPair.getPrivate(), keyPair.getPublic(), clock,
                "campuscouriers-user-service", "15m", "user-service-test-key-1");
    }

    @DisplayName("F2.3.1 - the user service should issue short-lived access tokens with a lifetime of 15 minutes")
    @Test
    void generateAccessToken_includesAccountIdEmailAndType() {
        when(clock.instant()).thenReturn(now);
        UUID mockUUID = new UUID(0L, 42L);
        Account account = accountWithId(mockUUID, VALID_EMAIL, AccountType.Student);

        String token = jwtService.generateAccessToken(account);

        Jws<Claims> jws = Jwts.parser()
                .verifyWith(keyPair.getPublic())
                .clock(() -> Date.from(now.plus(DurationStyle.detectAndParse("5m"))))
                .build()
                .parseSignedClaims(token);

        Claims claims = jws.getPayload();

        assertThat(jws.getHeader().getKeyId()).isEqualTo("user-service-test-key-1");
        assertThat(claims.getSubject()).isEqualTo(mockUUID.toString());
        assertThat(claims.getIssuer()).isEqualTo("campuscouriers-user-service");
        assertThat(claims.getIssuedAt().toInstant()).isEqualTo(now);
        assertThat(claims.getExpiration().toInstant()).isEqualTo(now.plus(Duration.ofMinutes(15)));
        assertThat(claims.get("email", String.class)).isEqualTo(VALID_EMAIL);
        assertThat(claims.get("type", String.class)).isEqualTo("Student");
    }

    // The parsing and validation of the JWT tokens to form AccessTokenClaims are for internal use of the user service
    // Other services should have their own version as well

    // Valid Access Token
    @Test
    void parseAndValidate_returnsTheOriginalClaims() {
        when(clock.instant()).thenReturn(now);
        UUID mockUUID = new UUID(0L, 42L);
        Account account = accountWithId(mockUUID, VALID_EMAIL, AccountType.Student);
        String token = jwtService.generateAccessToken(account);

        AccessTokenClaims claims = jwtService.parseAndValidate(token);

        assertThat(claims.accountId()).isEqualTo(mockUUID);
        assertThat(claims.email()).isEqualTo(VALID_EMAIL);
        assertThat(claims.type()).isEqualTo(AccountType.Student);
    }

    // Wrong Signing Key Pair on Access Token
    @Test
    void parseAndValidate_withATokenSignedByADifferentKey_throws() {
        KeyPair otherKeyPair = Jwts.SIG.RS256.keyPair().build();
        String foreignToken = Jwts.builder()
                .subject(new UUID(0L, 42L).toString())
                .issuer("campuscouriers-user-service")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(Duration.ofMinutes(15))))
                .claim("email", VALID_EMAIL)
                .claim("type", "Student")
                .signWith(otherKeyPair.getPrivate(), Jwts.SIG.RS256)
                .compact();

        assertThatThrownBy(() -> jwtService.parseAndValidate(foreignToken))
                .isInstanceOf(InvalidAccessTokenException.class);
    }

    // Expired Access Token
    @Test
    void parseAndValidate_withAnExpiredToken_throws() {
        when(clock.instant()).thenReturn(now);
        Instant past = Instant.parse("2020-01-01T00:00:00Z");
        String expiredToken = Jwts.builder()
                .subject(new UUID(0L, 42L).toString())
                .issuer("campuscouriers-user-service")
                .issuedAt(Date.from(past))
                .expiration(Date.from(past.plus(Duration.ofMinutes(15))))
                .claim("email", VALID_EMAIL)
                .claim("type", "Student")
                .signWith(keyPair.getPrivate(), Jwts.SIG.RS256)
                .compact();

        assertThatThrownBy(() -> jwtService.parseAndValidate(expiredToken))
                .isInstanceOf(InvalidAccessTokenException.class);
    }

    // Wrong Issuer on Access Token
    @Test
    void parseAndValidate_withAMismatchedIssuer_throws() {
        when(clock.instant()).thenReturn(now);
        String token = Jwts.builder()
                .subject(new UUID(0L, 42L).toString())
                .issuer("some-other-service")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(Duration.ofMinutes(15))))
                .signWith(keyPair.getPrivate(), Jwts.SIG.RS256)
                .compact();

        assertThatThrownBy(() -> jwtService.parseAndValidate(token))
                .isInstanceOf(InvalidAccessTokenException.class);
    }

    private static Account accountWithId(UUID id, String email, AccountType type) {
        Account account = new Account(type, email, "hashed-password");
        ReflectionTestUtils.setField(account, "id", id);
        ReflectionTestUtils.setField(account, "type", type);
        return account;
    }

}
