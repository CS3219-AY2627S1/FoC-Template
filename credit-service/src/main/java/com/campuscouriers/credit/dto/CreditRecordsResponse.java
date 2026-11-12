/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-06
 * Scope (AI-62): Generated the CreditRecordsResponse DTO for the credit service, including a static factory method to convert from the CreditRecords entity.
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.dto;

import com.campuscouriers.credit.entity.CreditRecords;

import java.time.Instant;
import java.util.UUID;

public record CreditRecordsResponse(
        UUID transactionId,
        UUID orderId,
        String type,
        String description,
        long amount,          
        long balanceAfter,
        Instant occurredAt    
) {
    public static CreditRecordsResponse from(CreditRecords r) {
        String description = switch (r.getType()) {
            case RESERVED        -> "Credits held for errand";
            case RELEASED        -> "Credits refunded from errand";
            case TRANSFERRED     -> "Credits paid out to courier";
            case RECEIVED        -> "Credits earned from errand";
        };
        return new CreditRecordsResponse(
                r.getCreditRecordId(),
                r.getOrderId(),
                r.getType().name(),
                description,
                r.getAvailableDelta(),
                r.getAvailableBalanceAfter(),
                r.getOccurredAt());
    }
}