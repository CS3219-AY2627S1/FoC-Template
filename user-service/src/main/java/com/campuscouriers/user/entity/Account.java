/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.entity;

import jakarta.persistence.*;
import lombok.Getter;

import java.util.UUID;

@Entity
@Table(name = "accounts")
@Getter
public class Account {

    // Getters
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(nullable=false)
    private AccountType type;
    @Column(nullable = false, unique = true)
    private String email;
    @Column(nullable=false)
    private String passwordHash;

    protected Account() {}  // required by JPA

    public Account(AccountType type, String email, String passwordHash) {
        this.type = type;
        this.email = email;
        this.passwordHash = passwordHash;
    }

    public void changeType(AccountType type) {
        this.type = type;
    }

    public void changeEmail(String email) {
        this.email = email;
    }

}
