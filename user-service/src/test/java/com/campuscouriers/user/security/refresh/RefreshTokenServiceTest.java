/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.security.refresh;

import com.campuscouriers.user.entity.Account;
import com.campuscouriers.user.entity.AccountType;
import com.campuscouriers.user.entity.RefreshToken;
import com.campuscouriers.user.exception.InvalidRefreshTokenException;
import com.campuscouriers.user.repository.RefreshTokenRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static com.campuscouriers.user.TestConstants.VALID_EMAIL;
import static org.assertj.core.api.AssertionsForClassTypes.assertThat;
import static org.assertj.core.api.AssertionsForClassTypes.assertThatCode;
import static org.assertj.core.api.AssertionsForClassTypes.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class RefreshTokenServiceTest {

    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private TokenHasher tokenHasher;
    @Mock private Clock clock;

    @Captor private ArgumentCaptor<RefreshToken> tokenCaptor;

    private RefreshTokenService refreshTokenService;

    private final Instant now = Instant.parse("2026-09-24T10:00:00Z");
    private final Account account = new Account(AccountType.Student, VALID_EMAIL, "hashes-password");

    @BeforeEach
    void createService() {
        refreshTokenService = new RefreshTokenService(refreshTokenRepository, tokenHasher, clock, "7d");
    }

    @DisplayName("F2.3.2 - the user service should issue refresh tokens with a lifetime of 7 days")
    @Test
    void issue_savesAHashedTokenLinkedToTheAccountWithA7DayExpiry() {
        when(clock.instant()).thenReturn(now);
        when(tokenHasher.hash(anyString())).thenReturn("hashed-value");

        String rawToken = refreshTokenService.issue(account);

        verify(refreshTokenRepository).save(tokenCaptor.capture());
        RefreshToken saved = tokenCaptor.getValue();
        assertThat(saved.getTokenHash()).isEqualTo("hashed-value");
        assertThat(saved.getAccount()).isSameAs(account);
        assertThat(saved.getExpiresAt()).isEqualTo(now.plus(Duration.ofDays(7)));
        assertThat(rawToken).isNotBlank();
    }

    @DisplayName("F4.3 - the user service shall invalidate the refresh token upon redemption on rotation")
    @Test
    void redeem_withAValidToken_returnsTheAccountAndDeletesTheToken() {
        when(clock.instant()).thenReturn(now);
        when(tokenHasher.hash("raw-token")).thenReturn("hashed-value");
        RefreshToken stored = new RefreshToken("hashed-value", account, now.plus(Duration.ofDays(1)));
        UUID tokenId = UUID.randomUUID();
        ReflectionTestUtils.setField(stored, "id", tokenId);
        when(refreshTokenRepository.findByTokenHash("hashed-value")).thenReturn(Optional.of(stored));
        when(refreshTokenRepository.consume(tokenId, now)).thenReturn(1);

        Account result = refreshTokenService.redeem("raw-token");

        assertThat(result).isSameAs(account);
        verify(refreshTokenRepository).consume(tokenId, now);
    }

    @DisplayName("F4.1 - the user service should verify the submitted refresh token is valid and unexpired.")
    @Test
    void redeem_withAnUnknownToken_throws() {
        when(tokenHasher.hash("bad-token")).thenReturn("hashed-value");
        when(refreshTokenRepository.findByTokenHash("hashed-value")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> refreshTokenService.redeem("bad-token"))
                .isInstanceOf(InvalidRefreshTokenException.class);
    }

    @DisplayName("F4.1.1 - the user service shall reject expired refresh tokens")
    @Test
    void redeem_withAnExpiredToken_throwsAndDeletesTheToken() {
        when(clock.instant()).thenReturn(now);
        when(tokenHasher.hash("old-token")).thenReturn("hashed-value");
        RefreshToken expired = new RefreshToken("hashed-value", account, now.minusSeconds(1));
        UUID tokenId = UUID.randomUUID();
        ReflectionTestUtils.setField(expired, "id", tokenId);
        when(refreshTokenRepository.findByTokenHash("hashed-value")).thenReturn(Optional.of(expired));
        when(refreshTokenRepository.consume(tokenId, now)).thenReturn(0);

        assertThatThrownBy(() -> refreshTokenService.redeem("old-token"))
                .isInstanceOf(InvalidRefreshTokenException.class);

        verify(refreshTokenRepository).consume(tokenId, now);
    }

    @DisplayName("F22 - logout shall revoke the submitted refresh token only for the authenticated account")
    @Test
    void revoke_hashesTheTokenAndDeletesOnlyForTheGivenAccount() {
        UUID accountId = UUID.randomUUID();
        when(tokenHasher.hash("raw-token")).thenReturn("hashed-value");
        when(refreshTokenRepository.revoke("hashed-value", accountId)).thenReturn(1);

        refreshTokenService.revoke("raw-token", accountId);

        verify(refreshTokenRepository).revoke("hashed-value", accountId);
    }

    @DisplayName("F22 - logout shall change nothing and not fail for an unknown, revoked, or foreign refresh token")
    @Test
    void revoke_withAnUnknownOrForeignToken_doesNotThrow() {
        UUID accountId = UUID.randomUUID();
        when(tokenHasher.hash("foreign-token")).thenReturn("hashed-value");
        when(refreshTokenRepository.revoke("hashed-value", accountId)).thenReturn(0);

        assertThatCode(() -> refreshTokenService.revoke("foreign-token", accountId))
                .doesNotThrowAnyException();
    }

    // F4.1.2 - the user service shall reject a refresh token that has already been used
    // this is implicitly fulfilled as used refresh tokens are deleted upon use on rotation
    // such used tokens will be caught as an unknown token as they cannot be found by the repository

}
