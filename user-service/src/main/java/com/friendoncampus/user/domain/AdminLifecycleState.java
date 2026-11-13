package com.friendoncampus.user.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Singleton row used to serialize administrator role and lifecycle changes. */
@Entity
@Table(name = "admin_lifecycle_state")
public class AdminLifecycleState {
    public static final String ID = "ADMIN_LIFECYCLE";

    @Id
    private String id;

    protected AdminLifecycleState() {
    }
}
