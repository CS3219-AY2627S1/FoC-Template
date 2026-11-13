package com.friendoncampus.user.service;

import java.util.UUID;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.UserRepository;

@Service
public class PasswordChangeService {
    private final UserRepository users;
    private final PasswordEncoder passwords;

    public PasswordChangeService(UserRepository users, PasswordEncoder passwords) {
        this.users = users;
        this.passwords = passwords;
    }

    @Transactional
    public void changePassword(UUID userId, String currentPassword, String newPassword) {
        User user = users.findById(userId).orElseThrow(ProfileNotFoundException::new);
        if (!passwords.matches(currentPassword, user.getPasswordHash())) {
            throw new CurrentPasswordIncorrectException();
        }
        if (passwords.matches(newPassword, user.getPasswordHash())) {
            throw new PasswordReuseException();
        }

        user.changePasswordHash(passwords.encode(newPassword));
        user.clearLoginFailures();
        users.save(user);
    }

    public static class CurrentPasswordIncorrectException extends RuntimeException {
        public CurrentPasswordIncorrectException() {
            super("Current password is incorrect");
        }
    }

    public static class ProfileNotFoundException extends RuntimeException {
        public ProfileNotFoundException() {
            super("Profile not found");
        }
    }
}
