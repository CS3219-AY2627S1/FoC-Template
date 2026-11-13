package com.friendoncampus.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.friendoncampus.user.domain.EmailVerificationAttempt;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.EmailVerificationAttemptRepository;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.support.JwtTestProperties;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:credential-concurrency;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000",
        "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa", "spring.datasource.password=" })
class CredentialConcurrencyIntegrationTest {
    @Autowired UserRepository users;
    @Autowired EmailVerificationAttemptRepository verificationAttempts;
    @Autowired EmailVerificationService emailVerifications;
    @Autowired PasswordResetService passwordResets;
    @Autowired LoginService logins;
    @Autowired PasswordEncoder passwords;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean EmailVerificationMailer verificationMailer;
    @MockitoBean PasswordResetMailer resetMailer;

    @DynamicPropertySource
    static void jwtProperties(DynamicPropertyRegistry registry) {
        JwtTestProperties.register(registry);
    }

    @BeforeEach
    void clearAccounts() {
        jdbc.update("DELETE FROM email_verification_attempts");
        jdbc.update("DELETE FROM password_reset_tokens");
        jdbc.update("DELETE FROM password_reset_request_cooldowns");
        jdbc.update("DELETE FROM users");
    }

    @Test
    void concurrentLoginFailuresLockTheAccount() throws Exception {
        User user = User.register("login-race@u.nus.edu", "Login Race", "login race",
                passwords.encode("correct-password-with-15-chars"));
        user.activate();
        users.save(user);

        boolean[] outcomes = concurrently(() -> rejectedLogin(user.getEmail()), () -> rejectedLogin(user.getEmail()));
        assertThat(outcomes).containsExactly(true, true);
        assertThat(users.findById(user.getId()).orElseThrow().getFailedLoginAttempts()).isEqualTo(2);

        assertThatThrownBy(() -> logins.login(user.getEmail(), "wrong-password"))
                .isInstanceOf(InvalidCredentialsException.class);
        User locked = users.findById(user.getId()).orElseThrow();
        assertThat(locked.getLoginLockoutUntil()).isAfter(OffsetDateTime.now(ZoneOffset.UTC));
        assertThatThrownBy(() -> logins.login(user.getEmail(), "correct-password-with-15-chars"))
                .isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void concurrentResetConfirmationsConsumeOneCodeOnlyOnce() throws Exception {
        User user = activeUser("reset-race@u.nus.edu", "Reset Race", "reset race");
        passwordResets.request(user.getEmail());
        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(resetMailer).sendPasswordResetCode(eq(user.getEmail()), code.capture());

        boolean[] outcomes = concurrently(
                () -> confirmReset(user.getEmail(), code.getValue()),
                () -> confirmReset(user.getEmail(), code.getValue()));
        assertThat(outcomes).containsExactlyInAnyOrder(true, false);
    }

    @Test
    void concurrentEmailVerificationsActivateOnlyOnce() throws Exception {
        User user = users.save(User.register("verify-race@u.nus.edu", "Verify Race", "verify race", "hash"));
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        EmailVerificationAttempt attempt = EmailVerificationAttempt.issue(user, passwords.encode("123456"), now);
        attempt.markSent(now);
        verificationAttempts.save(attempt);

        boolean[] outcomes = concurrently(
                () -> verifyEmail(user.getEmail(), "123456"),
                () -> verifyEmail(user.getEmail(), "123456"));
        assertThat(outcomes).containsExactlyInAnyOrder(true, false);
    }

    @Test
    void concurrentResendsCannotIssueTwoCodes() throws Exception {
        User user = users.save(User.register("resend-race@u.nus.edu", "Resend Race", "resend race", "hash"));
        OffsetDateTime sentAt = OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(91);
        EmailVerificationAttempt previous = EmailVerificationAttempt.issue(user, passwords.encode("123456"), sentAt);
        previous.markSent(sentAt);
        verificationAttempts.save(previous);

        boolean[] outcomes = concurrently(() -> resendEmail(user.getEmail()), () -> resendEmail(user.getEmail()));
        assertThat(outcomes).containsExactlyInAnyOrder(true, false);
        verify(verificationMailer).sendVerificationCode(eq(user.getEmail()), org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void concurrentFirstResetRequestsForAnUnknownEmailShareOneCooldown() throws Exception {
        boolean[] outcomes = concurrently(
                () -> passwordResets.request("unknown-race@u.nus.edu").retryAfterSeconds() > 0,
                () -> passwordResets.request("unknown-race@u.nus.edu").retryAfterSeconds() > 0);
        assertThat(outcomes).containsExactly(true, true);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM password_reset_request_cooldowns", Long.class))
                .isEqualTo(1);
        verifyNoInteractions(resetMailer);
    }

    private User activeUser(String email, String username, String normalizedUsername) {
        User user = User.register(email, username, normalizedUsername, passwords.encode("old-password-with-15-chars"));
        user.activate();
        return users.save(user);
    }

    private boolean rejectedLogin(String email) {
        try {
            logins.login(email, "wrong-password");
            return false;
        } catch (InvalidCredentialsException expected) {
            return true;
        }
    }

    private boolean confirmReset(String email, String code) {
        try {
            passwordResets.confirm(email, code, "new-password-with-15-chars");
            return true;
        } catch (InvalidPasswordResetCodeException expected) {
            return false;
        }
    }

    private boolean verifyEmail(String email, String code) {
        try {
            emailVerifications.verify(email, code);
            return true;
        } catch (InvalidEmailVerificationCodeException expected) {
            return false;
        }
    }

    private boolean resendEmail(String email) {
        try {
            emailVerifications.resend(email);
            return true;
        } catch (EmailVerificationCooldownException expected) {
            return false;
        }
    }

    private boolean[] concurrently(Callable<Boolean> first, Callable<Boolean> second) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Future<Boolean> firstResult = pool.submit(() -> runWhenReady(first, ready, start));
            Future<Boolean> secondResult = pool.submit(() -> runWhenReady(second, ready, start));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            return new boolean[] { firstResult.get(10, TimeUnit.SECONDS), secondResult.get(10, TimeUnit.SECONDS) };
        } finally {
            start.countDown();
            pool.shutdownNow();
        }
    }

    private boolean runWhenReady(Callable<Boolean> task, CountDownLatch ready, CountDownLatch start) throws Exception {
        ready.countDown();
        if (!start.await(10, TimeUnit.SECONDS)) {
            throw new IllegalStateException("Concurrent requests did not start");
        }
        return task.call();
    }
}
