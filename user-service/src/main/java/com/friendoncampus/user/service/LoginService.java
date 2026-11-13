package com.friendoncampus.user.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Locale;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.domain.UserRole;
import com.friendoncampus.user.repository.UserRepository;

@Service
public class LoginService {
    private static final String DUMMY_PASSWORD_HASH = "$2a$10$8LrWOCIf0XzW55OQ6J3Y2eTpwQG5dZJXWcd6D.4GzZ3SgNqg7EFAq";

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenService tokens;
    private final Clock clock;

    public LoginService(UserRepository users, PasswordEncoder passwordEncoder, JwtTokenService tokens, Clock clock) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.tokens = tokens;
        this.clock = clock;
    }

    @Transactional(noRollbackFor = InvalidCredentialsException.class)
    public LoginResult login(String email, String password) {
        if (email == null || password == null) {
            throw new InvalidCredentialsException();
        }
        User user = users.findByEmailForUpdate(email.trim().toLowerCase(Locale.ROOT)).orElse(null);
        boolean passwordMatches = passwordEncoder.matches(password,
                user == null ? DUMMY_PASSWORD_HASH : user.getPasswordHash());
        if (user == null || user.getStatus() == UserStatus.BANNED) {
            throw new InvalidCredentialsException();
        }
        OffsetDateTime now = now();
        if (user.isLoginLockedAt(now)) {
            throw new InvalidCredentialsException();
        }
        if (!passwordMatches) {
            user.recordFailedLoginAttempt(now);
            users.save(user);
            throw new InvalidCredentialsException();
        }
        if (user.getStatus() == UserStatus.UNVERIFIED) {
            throw new EmailVerificationRequiredException();
        }
        user.clearLoginFailures();
        users.save(user);
        return new LoginResult(user, UserRole.REQUESTER, tokens.issue(user, UserRole.REQUESTER));
    }

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock).withOffsetSameInstant(ZoneOffset.UTC);
    }

    public record LoginResult(User user, UserRole effectiveRole, JwtTokenService.IssuedToken token) {
    }
}
