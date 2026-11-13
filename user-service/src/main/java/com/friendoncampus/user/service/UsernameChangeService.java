package com.friendoncampus.user.service;

import java.util.Locale;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.UserRepository;

@Service
public class UsernameChangeService {
    private final UserRepository users;

    public UsernameChangeService(UserRepository users) {
        this.users = users;
    }

    @Transactional
    public User changeUsername(UUID userId, String username) {
        User user = users.findById(userId).orElseThrow(() -> new ProfileNotFoundException());
        String normalizedUsername = username.toLowerCase(Locale.ROOT);

        users.findByUsernameNormalized(normalizedUsername)
                .filter(existing -> !existing.getId().equals(userId))
                .ifPresent(existing -> {
                    throw new UsernameAlreadyTakenException();
                });

        user.changeUsername(username, normalizedUsername);
        return users.save(user);
    }

    public static class UsernameAlreadyTakenException extends RuntimeException {
        public UsernameAlreadyTakenException() {
            super("username is already taken");
        }
    }

    public static class ProfileNotFoundException extends RuntimeException {
        public ProfileNotFoundException() {
            super("Profile not found");
        }
    }
}
