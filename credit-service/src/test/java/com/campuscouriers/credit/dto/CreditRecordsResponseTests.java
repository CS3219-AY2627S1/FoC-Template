/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
 * Scope (AI-62):  Generated unit tests for CreditRecordsResponse DTO, including mapping from CreditRecords entity to user-facing response with correct field values and descriptions.
 * Author review: Code changes were checked and validated
 */  

package com.campuscouriers.credit.dto;

import com.campuscouriers.credit.entity.CreditRecords;
import com.campuscouriers.credit.entity.CreditRecordsType;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class CreditRecordsResponseTests {

    @ParameterizedTest
    @CsvSource({
            "RESERVED, Credits held for errand, -10",
            "RELEASED, Credits refunded from errand, 10",
            "TRANSFERRED, Credits paid out to courier, 0",
            "RECEIVED, Credits earned from errand, 10",
    })
    void mapsRecordToUserFacingHistoryEntry(CreditRecordsType type, String description, long availableDelta) {
        UUID walletId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        CreditRecords record = new CreditRecords(walletId, orderId, type, availableDelta, 0, 25, 5, null);
        UUID recordId = UUID.randomUUID();
        ReflectionTestUtils.setField(record, "creditRecordId", recordId);

        CreditRecordsResponse response = CreditRecordsResponse.from(record);

        assertThat(response.transactionId()).isEqualTo(recordId);
        assertThat(response.orderId()).isEqualTo(orderId);
        assertThat(response.type()).isEqualTo(type.name());
        assertThat(response.description()).isEqualTo(description);
        assertThat(response.amount()).isEqualTo(availableDelta);
        assertThat(response.balanceAfter()).isEqualTo(25);
        assertThat(response.occurredAt()).isEqualTo(record.getOccurredAt());
    }
}
