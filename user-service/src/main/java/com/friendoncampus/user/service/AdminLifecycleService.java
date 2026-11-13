package com.friendoncampus.user.service;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.user.domain.AdminLifecycleState;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserRole;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.repository.AdminLifecycleStateRepository;
import com.friendoncampus.user.repository.UserRepository;

/** ADMIN-only role and lifecycle operations, serialized to preserve the final active administrator. */
@Service
public class AdminLifecycleService {
    private final AdminLifecycleStateRepository lifecycleState;
    private final UserRepository users;
    private final UserAccountAudit audit;

    public AdminLifecycleService(AdminLifecycleStateRepository lifecycleState, UserRepository users, UserAccountAudit audit) {
        this.lifecycleState = lifecycleState;
        this.users = users;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public Page<User> list(UUID actorId, String query, Pageable pageable) {
        requireActiveAdmin(actorId);
        if (query != null && query.trim().matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) {
            var match = users.findById(UUID.fromString(query.trim())).stream().toList();
            return new PageImpl<>(pageable.getOffset() == 0 ? match : java.util.List.of(), pageable, match.size());
        }
        return query == null || query.isBlank() ? users.findAll(pageable) : users.searchByEmailOrUsername(query.trim(), pageable);
    }

    @Transactional
    public User promote(UUID actorId, UUID targetId) {
        User target = beginChange(actorId, targetId);
        requireActive(target);
        if (target.hasRole(UserRole.ADMIN)) {
            throw new AdminLifecycleException("Account is already an administrator");
        }
        target.promoteToAdmin();
        return users.save(target);
    }

    @Transactional
    public User demote(UUID actorId, UUID targetId) {
        User target = beginChange(actorId, targetId);
        requireActive(target);
        if (!target.hasRole(UserRole.ADMIN)) {
            throw new AdminLifecycleException("Account is not an administrator");
        }
        requireAnotherActiveAdmin();
        target.demoteToUser();
        return users.save(target);
    }

    @Transactional
    public User ban(UUID actorId, UUID targetId) {
        User target = beginChange(actorId, targetId);
        requireActive(target);
        if (target.hasRole(UserRole.ADMIN)) {
            requireAnotherActiveAdmin();
        }
        target.ban();
        return users.save(target);
    }

    @Transactional
    public User reactivate(UUID actorId, UUID targetId, String reason) {
        String text = reason == null ? "" : reason.strip();
        if (text.isEmpty() || text.length() > 2000) throw new IllegalArgumentException("A reactivation reason of 1–2000 characters is required");
        User target = beginChange(actorId, targetId);
        if (target.getStatus() != UserStatus.BANNED) {
            throw new AdminLifecycleException("Only banned accounts can be reactivated");
        }
        target.activate();
        audit.record(actorId, targetId, null, "REACTIVATED", "APPLIED", text);
        return users.save(target);
    }

    public record BanDecision(String result, String previousStatus, String reasonCode) { }

    /** Same lifecycle guard and protections as account management; no remote calls under its lock. */
    @Transactional
    public BanDecision banForCase(UUID actorId, UUID targetId) {
        try {
            User target = beginChange(actorId, targetId);
            String before = target.getStatus().name();
            if (target.getStatus() == UserStatus.BANNED) return new BanDecision("NO_CHANGE", before, null);
            requireActive(target);
            if (target.hasRole(UserRole.ADMIN)) requireAnotherActiveAdmin();
            target.ban();
            users.save(target);
            return new BanDecision("APPLIED", before, null);
        } catch (AdminAccessDeniedException ex) {
            return new BanDecision("REJECTED", null, "ACTOR_NOT_AUTHORIZED");
        } catch (AdminAccountNotFoundException ex) {
            return new BanDecision("REJECTED", null, "ACCOUNT_NOT_FOUND");
        } catch (AdminLifecycleException ex) {
            return new BanDecision("REJECTED", null, ex.code());
        }
    }

    private User beginChange(UUID actorId, UUID targetId) {
        lifecycleState.lockForLifecycleChange(AdminLifecycleState.ID)
                .orElseThrow(() -> new IllegalStateException("Administrator lifecycle state is missing"));
        User actor = requireActiveAdmin(actorId);
        User target = users.findById(targetId).orElseThrow(AdminAccountNotFoundException::new);
        if (actor.getId().equals(target.getId())) {
            throw new AdminLifecycleException("Administrators cannot revoke their own access", "SELF_SANCTION_FORBIDDEN");
        }
        return target;
    }

    private User requireActiveAdmin(UUID actorId) {
        User actor = users.findById(actorId).orElseThrow(() -> new AdminAccessDeniedException("Administrator access is required"));
        if (!actor.hasRole(UserRole.ADMIN) || actor.getStatus() != UserStatus.ACTIVE) {
            throw new AdminAccessDeniedException("Administrator access is required");
        }
        return actor;
    }

    private void requireActive(User target) {
        if (target.getStatus() != UserStatus.ACTIVE) {
            throw new AdminLifecycleException("Only active accounts can be changed");
        }
    }

    private void requireAnotherActiveAdmin() {
        if (users.countByRolesContainingAndStatus(UserRole.ADMIN, UserStatus.ACTIVE) <= 1) {
            throw new AdminLifecycleException("The final active administrator cannot be changed", "LAST_ADMIN_PROTECTED");
        }
    }
}
