package com.friendoncampus.user.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "password_reset_tokens")
public class PasswordResetToken {
    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 100)
    private String verifier;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "used_at")
    private OffsetDateTime usedAt;

    @Column(name = "invalidated_at")
    private OffsetDateTime invalidatedAt;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected PasswordResetToken() {
    }

    public static PasswordResetToken issue(User user, String verifier, OffsetDateTime now, OffsetDateTime expiresAt) {
        PasswordResetToken token = new PasswordResetToken();
        token.id = UUID.randomUUID();
        token.user = user;
        token.verifier = verifier;
        token.createdAt = now;
        token.expiresAt = expiresAt;
        return token;
    }

    public User getUser() { return user; }
    public String getVerifier() { return verifier; }
    public int getAttempts() { return attempts; }

    public boolean isUsableAt(OffsetDateTime now) {
        return usedAt == null && invalidatedAt == null && attempts < 5 && expiresAt.isAfter(now);
    }

    public void recordFailedAttempt() { attempts++; }
    public void markUsed(OffsetDateTime now) { usedAt = now; }
    public void invalidate(OffsetDateTime now) { invalidatedAt = now; }
}
