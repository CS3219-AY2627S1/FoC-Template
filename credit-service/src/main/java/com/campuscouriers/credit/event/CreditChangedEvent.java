/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-06 to 2026-11-09
 * Scope (AI-62): Generated the CreditChangedEvent class for the credit service, including static methods to determine the Kafka topic for a given change type and to create an event from CreditRecords and Wallet entities.
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.event;

import com.campuscouriers.credit.entity.CreditRecords;
import com.campuscouriers.credit.entity.CreditRecordsType;
import com.campuscouriers.credit.entity.Wallet;

import java.time.Instant;
import java.util.UUID;

// One credit change, published to the topic for its change type (see topicFor).
// creditRecordId is the credit record's id, so consumers can skip duplicates.
public record CreditChangedEvent(
        UUID creditRecordId,
        String changeType,           // RESERVED, RELEASED, TRANSFERRED or RECEIVED
        UUID orderId,
        UUID userId,                 // the user this change belongs to
        UUID counterpartyUserId,     // the other user in a transfer, otherwise null
        long amount,                 // signed change to the available balance
        long reserveAmount,          // signed change to the reserved balance
        long availableBalanceAfter,
        Instant occurredAt
) {
    // Event types, which are also the Kafka topics 
    public static final String RESERVED = "credit.reserved";
    public static final String RELEASED = "credit.released";
    public static final String TRANSFERRED = "credit.transferred";
    public static final String RECEIVED = "credit.received";

    public static String topicFor(String changeType) {
        return switch (CreditRecordsType.valueOf(changeType)) {
            case RESERVED    -> RESERVED;
            case RELEASED    -> RELEASED;
            case TRANSFERRED -> TRANSFERRED;
            case RECEIVED    -> RECEIVED;
        };
    }

    public static CreditChangedEvent from(CreditRecords record, Wallet wallet, Wallet counterparty) {
        return new CreditChangedEvent(
                record.getCreditRecordId(),
                record.getType().name(),
                record.getOrderId(),
                wallet.getUserUuid(),
                counterparty == null ? null : counterparty.getUserUuid(),
                record.getAvailableDelta(),
                record.getReserveDelta(),
                record.getAvailableBalanceAfter(),
                record.getOccurredAt());
    }
}