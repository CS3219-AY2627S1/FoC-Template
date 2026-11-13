package com.friendoncampus.user.domain;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.EnumSet;
import java.util.Set;

import jakarta.persistence.*;

@Entity
@Table(name = "users")
// A concurrent profile/password save must not restore a stale account lifecycle status.
@org.hibernate.annotations.DynamicUpdate
public class User {
    @Id private UUID id;
    @Column(nullable = false, unique = true, length = 254) private String email;
    @Column(nullable = false, length = 20) private String username;
    @Column(name = "username_normalized", nullable = false, unique = true, length = 20) private String usernameNormalized;
    @Column(name = "password_hash", nullable = false, length = 100) private String passwordHash;
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_roles", joinColumns = @JoinColumn(name = "user_id"))
    @Column(name = "role", nullable = false, length = 16)
    @Enumerated(EnumType.STRING)
    private Set<UserRole> roles = EnumSet.noneOf(UserRole.class);
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private UserStatus status;
    @Column(name = "failed_login_attempts", nullable = false) private int failedLoginAttempts;
    @Column(name = "login_lockout_until") private OffsetDateTime loginLockoutUntil;
    @Column(name = "created_at", nullable = false) private OffsetDateTime createdAt;
    @Column(name = "updated_at", nullable = false) private OffsetDateTime updatedAt;
    protected User() { }
    public static User register(String email, String username, String normalizedUsername, String passwordHash) {
        User user = new User(); user.id = UUID.randomUUID(); user.email = email; user.username = username;
        user.usernameNormalized = normalizedUsername; user.passwordHash = passwordHash; user.roles.add(UserRole.REQUESTER);
        user.status = UserStatus.UNVERIFIED; OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC); user.createdAt = now; user.updatedAt = now;
        return user;
    }
    public static User bootstrapAdmin(String email, String username, String normalizedUsername, String passwordHash) {
        User user = register(email, username, normalizedUsername, passwordHash);
        user.roles.add(UserRole.ADMIN);
        return user;
    }
    public UUID getId() { return id; } public String getEmail() { return email; } public String getUsername() { return username; }
    public String getPasswordHash() { return passwordHash; }
    public Set<UserRole> getRoles() { return Set.copyOf(roles); }
    public boolean hasRole(UserRole role) { return roles.contains(role); }
    public UserStatus getStatus() { return status; } public OffsetDateTime getCreatedAt() { return createdAt; }
    public int getFailedLoginAttempts() { return failedLoginAttempts; }
    public OffsetDateTime getLoginLockoutUntil() { return loginLockoutUntil; }

    public void changePasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
        this.updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public void changeUsername(String username, String normalizedUsername) {
        this.username = username;
        this.usernameNormalized = normalizedUsername;
        this.updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public boolean isLoginLockedAt(OffsetDateTime now) {
        return loginLockoutUntil != null && loginLockoutUntil.isAfter(now);
    }

    public void recordFailedLoginAttempt(OffsetDateTime now) {
        failedLoginAttempts++;
        if (failedLoginAttempts == 3) {
            failedLoginAttempts = 0;
            loginLockoutUntil = now.plusSeconds(30);
        }
        updatedAt = now;
    }

    public void clearLoginFailures() {
        failedLoginAttempts = 0;
        loginLockoutUntil = null;
        updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public void activate() {
        this.status = UserStatus.ACTIVE;
        this.updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public void promoteToAdmin() {
        this.roles.add(UserRole.ADMIN);
        this.updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public void demoteToUser() {
        this.roles.remove(UserRole.ADMIN);
        this.updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public void enableRole(UserRole role) {
        this.roles.add(role);
        this.updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public void ban() {
        this.status = UserStatus.BANNED;
        this.updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }
}
