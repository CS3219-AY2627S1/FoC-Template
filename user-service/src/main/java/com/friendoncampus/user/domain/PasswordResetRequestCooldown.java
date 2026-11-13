package com.friendoncampus.user.domain;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "password_reset_request_cooldowns")
public class PasswordResetRequestCooldown {
    @Id
    @Column(name = "email_digest", length = 64)
    private String emailDigest;

    @Column(name = "next_available_at", nullable = false)
    private OffsetDateTime nextAvailableAt;

    protected PasswordResetRequestCooldown() {
    }

    public static PasswordResetRequestCooldown start(String emailDigest, OffsetDateTime nextAvailableAt) {
        PasswordResetRequestCooldown cooldown = new PasswordResetRequestCooldown();
        cooldown.emailDigest = emailDigest;
        cooldown.nextAvailableAt = nextAvailableAt;
        return cooldown;
    }

    public boolean isActiveAt(OffsetDateTime now) {
        return nextAvailableAt.isAfter(now);
    }

    public OffsetDateTime getNextAvailableAt() {
        return nextAvailableAt;
    }

    public void restart(OffsetDateTime nextAvailableAt) {
        this.nextAvailableAt = nextAvailableAt;
    }
}
