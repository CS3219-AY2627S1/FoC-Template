package com.friendoncampus.user.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Serializes the first cooldown request, before a per-email row exists. */
@Entity
@Table(name = "password_reset_request_guard")
public class PasswordResetRequestGuard {
    @Id
    private Integer id;

    protected PasswordResetRequestGuard() {
    }
}
