package com.friendoncampus.user.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Singleton row used to serialize and record the one-shot first-admin bootstrap. */
@Entity
@Table(name = "admin_bootstrap_state")
public class AdminBootstrapState {
    public static final String FIRST_ADMIN = "FIRST_ADMIN";

    @Id
    private String id;
    @Column(name = "completed_at")
    private OffsetDateTime completedAt;
    @Column(name = "admin_id")
    private UUID adminId;

    protected AdminBootstrapState() {
    }

    public static AdminBootstrapState firstAdmin() {
        AdminBootstrapState state = new AdminBootstrapState();
        state.id = FIRST_ADMIN;
        return state;
    }

    public boolean isCompleted() {
        return completedAt != null;
    }

    public void complete(UUID userId, OffsetDateTime at) {
        this.adminId = userId;
        this.completedAt = at;
    }
}
