/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-11-10
 * Scope (AI-28): Generated the account list endpoint, admin users page and their tests.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.account.dto;

import com.campuscouriers.user.entity.AccountType;

import java.util.UUID;

// One row of the administrator account list. name is null if the account has no profile
public record AccountSummaryResponse(
        UUID id,
        String email,
        String name,
        AccountType type
) {

}
