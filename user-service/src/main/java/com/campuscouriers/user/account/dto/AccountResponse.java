/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.account.dto;

import com.campuscouriers.user.entity.Account;
import com.campuscouriers.user.entity.AccountType;

import java.util.UUID;

public record AccountResponse(
        UUID id,
        String email,
        AccountType type
) {

    public static AccountResponse from(Account account) {
        return new AccountResponse(account.getId(), account.getEmail(), account.getType());
    }

}
