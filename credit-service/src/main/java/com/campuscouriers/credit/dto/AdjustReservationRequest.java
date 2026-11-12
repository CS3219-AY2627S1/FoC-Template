/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-10-21
 * Scope (AI-61): Generated the AdjustReservationRequest record for the credit service
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.dto;

import jakarta.validation.constraints.Positive;

public record AdjustReservationRequest(
        @Positive long newAmount
) {
}