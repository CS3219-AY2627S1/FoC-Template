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
@Table(name = "profiles")
@Getter
public class Profile {

    @Id
    private UUID id;

    @OneToOne(optional = false)
    @MapsId
    @JoinColumn(name = "account_id", nullable = false, unique = true)
    private Account account;

    @Column(nullable=false)
    private String name;

    protected Profile() {}  // required by JPA

    public Profile(Account account, String name) {
        this.account = account;
        this.name = name;
    }

    public void changeName(String name) {
        this.name = name;
    }

}
