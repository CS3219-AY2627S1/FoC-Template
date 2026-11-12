/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.account.dto;

import com.campuscouriers.user.entity.AccountType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

// type is kept as a String so only the exact accepted spellings pass validation (400 otherwise)
public record UpdateAccountTypeRequest(
        @NotNull @Pattern(regexp = "Student|student|Administrator|administrator") String type
) {

    public AccountType accountType() {
        return type.equalsIgnoreCase("student") ? AccountType.Student : AccountType.Administrator;
    }

}
