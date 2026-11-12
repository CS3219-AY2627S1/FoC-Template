/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-08
 * Scope (AI-08): Removed trailing full stops from alert text and updated examples and tests.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-08
 * Scope: Generated and refined chat notification event tests.
 */
package com.campuscouriers.notification_service.event;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import com.campuscouriers.notification_service.notification.NotificationService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class NotificationEventListenersTest {
    private final NotificationService notifications = mock(NotificationService.class);

    @Test
    void deliveredUsesRequesterAndOutboxHeader() {
        UUID eventId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID requesterId = UUID.randomUUID();
        UUID courierId = UUID.randomUUID();
        var record = record("errand.delivered", """
            {"errandId":"%s","requesterId":"%s","courierId":"%s","creditValue":10,
             "deliveredAt":"2026-11-07T08:00:00Z"}
            """.formatted(orderId, requesterId, courierId));
        record.headers().add("eventId", eventId.toString().getBytes(StandardCharsets.UTF_8));

        new ErrandEventListener(new ErrandEventParser(), notifications).onEvent(record);

        verify(notifications).save(eventId, requesterId, "ERRAND_DELIVERED", orderId,
            "Your courier marked your errand as delivered");
    }

    @ParameterizedTest
    @CsvSource({
        "EXPIRED, Your errand expired before anyone accepted it",
        "FAILED, Your errand expired before the courier marked it delivered"
    })
    void expiryUsesRequesterAndResultingStatus(String status, String message) {
        UUID eventId = UUID.randomUUID();
        UUID errandId = UUID.randomUUID();
        UUID requesterId = UUID.randomUUID();
        var record = record("errand.expired", """
            {"errandId":"%s","requesterId":"%s","resultingStatus":"%s"}
            """.formatted(errandId, requesterId, status));
        record.headers().add("eventId", eventId.toString().getBytes(StandardCharsets.UTF_8));

        new ErrandEventListener(new ErrandEventParser(), notifications).onExpiry(record);

        verify(notifications).save(eventId, requesterId, "ERRAND_EXPIRED", errandId, message);
    }

    @Test
    void chatMessageUsesRecipientAndOutboxHeader() {
        UUID eventId = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();
        UUID errandId = UUID.randomUUID();
        UUID conversationId = UUID.randomUUID();
        UUID recipientId = UUID.randomUUID();
        var record = record("chat.message.created", """
            {"messageId":"%s","conversationId":"%s","errandId":"%s",
             "senderId":"%s","recipientId":"%s","sequenceNumber":12,
             "createdAt":"2026-11-08T08:00:00Z"}
            """.formatted(messageId, conversationId, errandId,
                UUID.randomUUID(), recipientId));
        record.headers().add("eventId", eventId.toString().getBytes(StandardCharsets.UTF_8));

        new ChatMessageEventListener(new ChatMessageEventParser(), notifications).onEvent(record);

        verify(notifications).save(eventId, recipientId, "CHAT_MESSAGE", errandId, conversationId,
            messageId,
            "You received a new message.");
    }

    @Test
    void malformedChatMessageDoesNotCreateNotification() {
        var record = record("chat.message.created", "{} ");
        record.headers().add("eventId",
            UUID.randomUUID().toString().getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> new ChatMessageEventListener(
            new ChatMessageEventParser(), notifications).onEvent(record))
            .isInstanceOf(InvalidNotificationEventException.class);
        verifyNoInteractions(notifications);
    }

    @ParameterizedTest
    @CsvSource({
        "credit.received, RECEIVED, 1, You received 1 credit for your errand",
        "credit.released, RELEASED, 10, 10 credits from your errand reservation returned to your available balance"
    })
    void creditAlertsUseCreditRecordIdAndAffectedAccount(
            String topic, String change, long amount, String message) {
        UUID eventId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        var record = record(topic, creditPayload(eventId, orderId, userId, change, amount));
        record.headers().add("eventId", UUID.randomUUID().toString().getBytes(StandardCharsets.UTF_8));

        new CreditEventListener(notifications).onEvent(record);

        verify(notifications).save(eventId, userId, "CREDIT_" + change, orderId, message);
    }

    @ParameterizedTest
    @CsvSource({"RELEASED, 10", "RECEIVED, 0", "RECEIVED, -1"})
    void rejectsMismatchedCreditChangesAndNonpositiveAmounts(String change, long amount) {
        var record = record("credit.received",
            creditPayload(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), change, amount));

        assertThatThrownBy(() -> new CreditEventListener(notifications).onEvent(record))
            .isInstanceOf(InvalidNotificationEventException.class);
        verifyNoInteractions(notifications);
    }

    private ConsumerRecord<String, String> record(String topic, String payload) {
        return new ConsumerRecord<>(topic, 0, 0, "order-key", payload);
    }

    private String creditPayload(UUID eventId, UUID orderId, UUID userId, String change, long amount) {
        return """
            {"eventId":"%s","changeType":"%s","orderId":"%s","userId":"%s",
             "counterpartyUserId":"%s","amount":%d,"reserveAmount":0,"availableBalanceAfter":42,
             "occurredAt":"2026-11-07T08:00:00Z"}
            """.formatted(eventId, change, orderId, userId, UUID.randomUUID(), amount);
    }
}
