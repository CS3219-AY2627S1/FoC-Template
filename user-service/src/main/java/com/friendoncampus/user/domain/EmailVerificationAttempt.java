package com.friendoncampus.user.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.persistence.*;

@Entity
@Table(name = "email_verification_attempts")
public class EmailVerificationAttempt {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "user_id", nullable = false) private User user;
    @Column(nullable = false, length = 100) private String verifier;
    @Column(name = "expires_at", nullable = false) private OffsetDateTime expiresAt;
    @Column(nullable = false) private int attempts;
    @Column(name = "sent_at") private OffsetDateTime sentAt;
    @Column(name = "used_at") private OffsetDateTime usedAt;
    @Column(name = "invalidated_at") private OffsetDateTime invalidatedAt;
    @Column(name = "created_at", nullable = false) private OffsetDateTime createdAt;
    protected EmailVerificationAttempt() { }
    public static EmailVerificationAttempt issue(User user, String verifier, OffsetDateTime now) { return issue(user, verifier, now, now.plusMinutes(10)); }
    public static EmailVerificationAttempt issue(User user, String verifier, OffsetDateTime now, OffsetDateTime expiresAt) { EmailVerificationAttempt attempt = new EmailVerificationAttempt(); attempt.id = UUID.randomUUID(); attempt.user = user; attempt.verifier = verifier; attempt.createdAt = now; attempt.expiresAt = expiresAt; return attempt; }
    public String getVerifier() { return verifier; }
    public int getAttempts() { return attempts; }
    public OffsetDateTime getSentAt() { return sentAt; }
    public boolean isUsableAt(OffsetDateTime now) { return sentAt != null && usedAt == null && invalidatedAt == null && attempts < 5 && expiresAt.isAfter(now); }
    public void markSent(OffsetDateTime now) { sentAt = now; }
    public void recordFailedAttempt() { attempts++; }
    public void markUsed(OffsetDateTime now) { usedAt = now; }
}
