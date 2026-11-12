/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.security.access;

import com.campuscouriers.user.entity.AccountType;

import java.util.UUID;

public record AccessTokenClaims(
        UUID accountId,
        String email,
        AccountType type
) {

    public AccessTokenClaims {
        if (accountId == null || email == null || email.isBlank() || type == null) {
            throw new IllegalArgumentException("Access token is missing required claims");
        }
    }

}
