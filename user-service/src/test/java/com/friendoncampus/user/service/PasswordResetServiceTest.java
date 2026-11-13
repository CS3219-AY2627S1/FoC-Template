package com.friendoncampus.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.friendoncampus.user.domain.PasswordResetToken;
import com.friendoncampus.user.domain.PasswordResetRequestGuard;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.repository.PasswordResetTokenRepository;
import com.friendoncampus.user.repository.PasswordResetRequestCooldownRepository;
import com.friendoncampus.user.repository.PasswordResetRequestGuardRepository;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.support.FakePasswordResetMailer;

@ExtendWith(MockitoExtension.class)
class PasswordResetServiceTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");

    @Mock UserRepository users;
    @Mock PasswordResetTokenRepository tokens;
    @Mock PasswordResetRequestCooldownRepository requestCooldowns;
    @Mock PasswordResetRequestGuardRepository requestGuard;
    @Mock PasswordEncoder passwords;

    private FakePasswordResetMailer mailer;
    private PasswordResetService service;
    private User user;

    @BeforeEach
    void setUp() {
        mailer = new FakePasswordResetMailer();
        service = new PasswordResetService(users, tokens, requestCooldowns, requestGuard, passwords, mailer, Clock.fixed(NOW, ZoneOffset.UTC));
        lenient().when(requestGuard.lockForRequest(1)).thenReturn(Optional.of(mock(PasswordResetRequestGuard.class)));
        user = User.register("alice@u.nus.edu", "Alice", "alice", "old-hash");
        user.activate();
    }

    @Test
    void createsAHashedSixDigitCodeAndSendsItForAnActiveAccount() {
        when(users.findByEmailForUpdate("alice@u.nus.edu")).thenReturn(Optional.of(user));
        when(passwords.encode(any())).thenAnswer(invocation -> "hashed-" + invocation.getArgument(0));

        assertThat(service.request(" Alice@U.NUS.EDU ").retryAfterSeconds()).isEqualTo(90);

        ArgumentCaptor<PasswordResetToken> token = ArgumentCaptor.forClass(PasswordResetToken.class);
        verify(tokens).invalidateActiveForUser(eq(user.getId()), any());
        verify(tokens).save(token.capture());
        assertThat(mailer.messages()).hasSize(1);
        String code = mailer.messages().get(0).code();
        assertThat(code).matches("\\d{6}");
        assertThat(token.getValue().getVerifier()).isEqualTo("hashed-" + code);
    }

    @Test
    void returnsWithoutCreatingOrSendingAnythingForUnknownOrBannedAccounts() {
        when(users.findByEmailForUpdate("missing@u.nus.edu")).thenReturn(Optional.empty());
        assertThat(service.request("missing@u.nus.edu").retryAfterSeconds()).isEqualTo(90);

        User banned = mock(User.class);
        when(banned.getStatus()).thenReturn(UserStatus.BANNED);
        when(users.findByEmailForUpdate("banned@u.nus.edu")).thenReturn(Optional.of(banned));
        assertThat(service.request("banned@u.nus.edu").retryAfterSeconds()).isEqualTo(90);

        verifyNoInteractions(tokens, passwords);
        assertThat(mailer.messages()).isEmpty();
    }

    @Test
    void masksMailerFailureForAnExistingAccountWithoutExposingTheCode() {
        PasswordResetMailer failingMailer = mock(PasswordResetMailer.class);
        doThrow(new IllegalStateException("provider unavailable"))
                .when(failingMailer).sendPasswordResetCode(eq(user.getEmail()), any());
        PasswordResetService failingService = new PasswordResetService(users, tokens, requestCooldowns,
                requestGuard, passwords, failingMailer, Clock.fixed(NOW, ZoneOffset.UTC));
        when(users.findByEmailForUpdate(user.getEmail())).thenReturn(Optional.of(user));
        when(passwords.encode(any())).thenReturn("verifier");

        assertThat(failingService.request(user.getEmail()).retryAfterSeconds()).isEqualTo(90);
        verify(tokens).invalidateActiveForUser(eq(user.getId()), any());
        verify(tokens).save(any(PasswordResetToken.class));
    }

    @Test
    void confirmsAValidCodeAndChangesThePassword() {
        PasswordResetToken token = tokenExpiringAt(NOW.plusSeconds(600));
        when(users.findByEmailForUpdate("alice@u.nus.edu")).thenReturn(Optional.of(user));
        when(tokens.findFirstByUser_IdAndUsedAtIsNullAndInvalidatedAtIsNullOrderByCreatedAtDesc(user.getId()))
                .thenReturn(Optional.of(token));
        when(passwords.matches("123456", "verifier")).thenReturn(true);
        when(passwords.encode("new-password-123")).thenReturn("new-hash");

        service.confirm("alice@u.nus.edu", "123456", "new-password-123");

        assertThat(user.getPasswordHash()).isEqualTo("new-hash");
        verify(users).save(user);
        verify(tokens).save(token);
    }

    @Test
    void rejectsAReplacementMatchingTheCurrentPasswordWithoutConsumingTheCode() {
        PasswordResetToken token = tokenExpiringAt(NOW.plusSeconds(600));
        when(users.findByEmailForUpdate("alice@u.nus.edu")).thenReturn(Optional.of(user));
        when(tokens.findFirstByUser_IdAndUsedAtIsNullAndInvalidatedAtIsNullOrderByCreatedAtDesc(user.getId()))
                .thenReturn(Optional.of(token));
        when(passwords.matches("123456", "verifier")).thenReturn(true);
        when(passwords.matches("old-password-with-15-chars", "old-hash")).thenReturn(true);

        assertThatThrownBy(() -> service.confirm("alice@u.nus.edu", "123456", "old-password-with-15-chars"))
                .isInstanceOf(PasswordReuseException.class)
                .hasMessage("New password must be different from your current password");

        assertThat(token.isUsableAt(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC))).isTrue();
        verify(passwords, never()).encode(any());
        verify(users, never()).save(user);
        verify(tokens, never()).save(token);
    }

    @Test
    void validatesAValidCodeWithoutChangingThePasswordOrConsumingTheCode() {
        PasswordResetToken token = tokenExpiringAt(NOW.plusSeconds(600));
        when(users.findByEmailForUpdate("alice@u.nus.edu")).thenReturn(Optional.of(user));
        when(tokens.findFirstByUser_IdAndUsedAtIsNullAndInvalidatedAtIsNullOrderByCreatedAtDesc(user.getId()))
                .thenReturn(Optional.of(token));
        when(passwords.matches("123456", "verifier")).thenReturn(true);

        service.verify("alice@u.nus.edu", "123456");

        assertThat(user.getPasswordHash()).isEqualTo("old-hash");
        verify(passwords).matches("123456", "verifier");
        verify(tokens, never()).save(any());
    }

    @Test
    void rejectsExpiredAndReplayedCodes() {
        PasswordResetToken expired = tokenExpiringAt(NOW.minusSeconds(1));
        when(users.findByEmailForUpdate("alice@u.nus.edu")).thenReturn(Optional.of(user));
        when(tokens.findFirstByUser_IdAndUsedAtIsNullAndInvalidatedAtIsNullOrderByCreatedAtDesc(user.getId()))
                .thenReturn(Optional.of(expired));
        assertThatThrownBy(() -> service.confirm("alice@u.nus.edu", "123456", "new-password-123"))
                .isInstanceOf(InvalidPasswordResetCodeException.class);

        PasswordResetToken used = tokenExpiringAt(NOW.plusSeconds(600));
        used.markUsed(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC));
        when(tokens.findFirstByUser_IdAndUsedAtIsNullAndInvalidatedAtIsNullOrderByCreatedAtDesc(user.getId()))
                .thenReturn(Optional.of(used));
        assertThatThrownBy(() -> service.confirm("alice@u.nus.edu", "123456", "new-password-123"))
                .isInstanceOf(InvalidPasswordResetCodeException.class);
        verifyNoInteractions(passwords);
    }

    @Test
    void exhaustsTheCodeAfterFiveIncorrectAttempts() {
        PasswordResetToken token = tokenExpiringAt(NOW.plusSeconds(600));
        when(users.findByEmailForUpdate("alice@u.nus.edu")).thenReturn(Optional.of(user));
        when(tokens.findFirstByUser_IdAndUsedAtIsNullAndInvalidatedAtIsNullOrderByCreatedAtDesc(user.getId()))
                .thenReturn(Optional.of(token));
        when(passwords.matches("000000", "verifier")).thenReturn(false);

        for (int attempt = 0; attempt < 5; attempt++) {
            assertThatThrownBy(() -> service.confirm("alice@u.nus.edu", "000000", "new-password-123"))
                    .isInstanceOf(InvalidPasswordResetCodeException.class);
        }
        assertThat(token.getAttempts()).isEqualTo(5);
        assertThatThrownBy(() -> service.confirm("alice@u.nus.edu", "000000", "new-password-123"))
                .isInstanceOf(InvalidPasswordResetCodeException.class);
        verify(passwords, times(5)).matches("000000", "verifier");
    }

    @Test
    void invalidatesThePreviousActiveCodeBeforeIssuingAnother() {
        when(users.findByEmailForUpdate("alice@u.nus.edu")).thenReturn(Optional.of(user));
        when(passwords.encode(any())).thenReturn("verifier");

        service.request("alice@u.nus.edu");

        verify(tokens).invalidateActiveForUser(eq(user.getId()), any());
    }

    @Test
    void suppressesAnotherCodeUntilTheServerSideCooldownExpires() {
        com.friendoncampus.user.domain.PasswordResetRequestCooldown cooldown =
                com.friendoncampus.user.domain.PasswordResetRequestCooldown.start("digest",
                        OffsetDateTime.ofInstant(NOW.plusSeconds(30), ZoneOffset.UTC));
        when(requestCooldowns.findByEmailDigestForUpdate(any())).thenReturn(Optional.of(cooldown));

        assertThat(service.request("alice@u.nus.edu").retryAfterSeconds()).isEqualTo(30);

        verifyNoInteractions(users, tokens, passwords);
        assertThat(mailer.messages()).isEmpty();
    }

    @Test
    void clearsLoginFailuresWhenThePasswordIsSuccessfullyReset() {
        user.recordFailedLoginAttempt(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC));
        PasswordResetToken token = tokenExpiringAt(NOW.plusSeconds(600));
        when(users.findByEmailForUpdate("alice@u.nus.edu")).thenReturn(Optional.of(user));
        when(tokens.findFirstByUser_IdAndUsedAtIsNullAndInvalidatedAtIsNullOrderByCreatedAtDesc(user.getId()))
                .thenReturn(Optional.of(token));
        when(passwords.matches("123456", "verifier")).thenReturn(true);
        when(passwords.encode("new-password-123")).thenReturn("new-hash");

        service.confirm("alice@u.nus.edu", "123456", "new-password-123");

        assertThat(user.getFailedLoginAttempts()).isZero();
        assertThat(user.getLoginLockoutUntil()).isNull();
    }

    private PasswordResetToken tokenExpiringAt(Instant expiresAt) {
        OffsetDateTime now = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC);
        return PasswordResetToken.issue(user, "verifier", now, OffsetDateTime.ofInstant(expiresAt, ZoneOffset.UTC));
    }
}
