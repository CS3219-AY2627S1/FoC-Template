package com.friendoncampus.user.service;

import java.security.SecureRandom;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Locale;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.friendoncampus.user.domain.PasswordResetToken;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.repository.PasswordResetTokenRepository;
import com.friendoncampus.user.repository.PasswordResetRequestCooldownRepository;
import com.friendoncampus.user.repository.PasswordResetRequestGuardRepository;
import com.friendoncampus.user.domain.PasswordResetRequestCooldown;
import com.friendoncampus.user.repository.UserRepository;

@Service
public class PasswordResetService {
    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
    private static final int CODE_BOUND = 1_000_000;
    private static final int CODE_LENGTH = 6;
    private static final long REQUEST_COOLDOWN_SECONDS = 90;

    private final UserRepository users;
    private final PasswordResetTokenRepository tokens;
    private final PasswordResetRequestCooldownRepository requestCooldowns;
    private final PasswordResetRequestGuardRepository requestGuard;
    private final PasswordEncoder passwordEncoder;
    private final PasswordResetMailer mailer;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public PasswordResetService(UserRepository users, PasswordResetTokenRepository tokens,
            PasswordResetRequestCooldownRepository requestCooldowns, PasswordResetRequestGuardRepository requestGuard,
            PasswordEncoder passwordEncoder,
            PasswordResetMailer mailer, Clock clock) {
        this.users = users;
        this.tokens = tokens;
        this.requestCooldowns = requestCooldowns;
        this.requestGuard = requestGuard;
        this.passwordEncoder = passwordEncoder;
        this.mailer = mailer;
        this.clock = clock;
    }

    @Transactional
    public PasswordResetRequestResult request(String email) {
        requestGuard.lockForRequest(1).orElseThrow(() -> new IllegalStateException("Password reset request guard is missing"));
        String normalizedEmail = normalizeEmail(email);
        OffsetDateTime now = now();
        PasswordResetRequestCooldown cooldown = requestCooldowns.findByEmailDigestForUpdate(emailDigest(normalizedEmail)).orElse(null);
        if (cooldown != null && cooldown.isActiveAt(now)) {
            return new PasswordResetRequestResult(secondsUntil(cooldown.getNextAvailableAt(), now));
        }
        OffsetDateTime nextAvailableAt = now.plusSeconds(REQUEST_COOLDOWN_SECONDS);
        if (cooldown == null) {
            requestCooldowns.save(PasswordResetRequestCooldown.start(emailDigest(normalizedEmail), nextAvailableAt));
        } else {
            cooldown.restart(nextAvailableAt);
            requestCooldowns.save(cooldown);
        }

        User user = users.findByEmailForUpdate(normalizedEmail).orElse(null);
        if (user == null || user.getStatus() != UserStatus.ACTIVE) {
            return new PasswordResetRequestResult(REQUEST_COOLDOWN_SECONDS);
        }

        String code = generateCode();
        tokens.invalidateActiveForUser(user.getId(), now);
        tokens.save(PasswordResetToken.issue(user, passwordEncoder.encode(code), now, now.plusMinutes(10)));
        try {
            mailer.sendPasswordResetCode(user.getEmail(), code);
        } catch (RuntimeException exception) {
            // Do not reveal account existence or include an address, code, or provider response in logs.
            log.warn("Password reset email delivery failed");
        }
        return new PasswordResetRequestResult(REQUEST_COOLDOWN_SECONDS);
    }

    @Transactional(noRollbackFor = InvalidPasswordResetCodeException.class)
    public void confirm(String email, String code, String newPassword) {
        ValidatedReset reset = validate(email, code);
        User user = reset.user();
        PasswordResetToken token = reset.token();
        OffsetDateTime now = now();

        if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            throw new PasswordReuseException();
        }

        user.changePasswordHash(passwordEncoder.encode(newPassword));
        user.clearLoginFailures();
        token.markUsed(now);
        users.save(user);
        tokens.save(token);
    }

    @Transactional(noRollbackFor = InvalidPasswordResetCodeException.class)
    public void verify(String email, String code) {
        validate(email, code);
    }

    private ValidatedReset validate(String email, String code) {
        User user = users.findByEmailForUpdate(normalizeEmail(email)).orElse(null);
        if (user == null || user.getStatus() != UserStatus.ACTIVE) {
            throw new InvalidPasswordResetCodeException();
        }

        PasswordResetToken token = tokens
                .findFirstByUser_IdAndUsedAtIsNullAndInvalidatedAtIsNullOrderByCreatedAtDesc(user.getId())
                .orElseThrow(InvalidPasswordResetCodeException::new);
        if (!token.isUsableAt(now())) {
            throw new InvalidPasswordResetCodeException();
        }
        if (!passwordEncoder.matches(code, token.getVerifier())) {
            token.recordFailedAttempt();
            tokens.save(token);
            throw new InvalidPasswordResetCodeException();
        }
        return new ValidatedReset(user, token);
    }

    private record ValidatedReset(User user, PasswordResetToken token) {
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock).withOffsetSameInstant(ZoneOffset.UTC);
    }

    private String generateCode() {
        return String.format("%0" + CODE_LENGTH + "d", random.nextInt(CODE_BOUND));
    }

    private String emailDigest(String email) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(email.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private long secondsUntil(OffsetDateTime deadline, OffsetDateTime now) {
        long milliseconds = java.time.Duration.between(now, deadline).toMillis();
        return Math.max(1, (milliseconds + 999) / 1000);
    }

    public record PasswordResetRequestResult(long retryAfterSeconds) {
    }
}
