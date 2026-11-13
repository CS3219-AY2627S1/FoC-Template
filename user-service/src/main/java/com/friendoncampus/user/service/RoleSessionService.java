package com.friendoncampus.user.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserRole;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.repository.UserRepository;

/** Issues a replacement token whose single role is the account's selected workspace. */
@Service
public class RoleSessionService {
    private final UserRepository users;
    private final JwtTokenService tokens;

    public RoleSessionService(UserRepository users, JwtTokenService tokens) {
        this.users = users;
        this.tokens = tokens;
    }

    @Transactional
    public RoleSession switchRole(UUID userId, UserRole effectiveRole) {
        User user = users.findById(userId)
                .orElseThrow(() -> new RoleSessionAccessDeniedException("An active account is required"));
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new RoleSessionAccessDeniedException("An active account is required");
        }
        if (effectiveRole == UserRole.COURIER) {
            user.enableRole(UserRole.COURIER);
        }
        if (!user.hasRole(effectiveRole)) {
            throw new RoleSessionAccessDeniedException("This account is not allowed to use that role");
        }
        users.save(user);
        return new RoleSession(user, effectiveRole, tokens.issue(user, effectiveRole));
    }

    public record RoleSession(User user, UserRole effectiveRole, JwtTokenService.IssuedToken token) { }
}
