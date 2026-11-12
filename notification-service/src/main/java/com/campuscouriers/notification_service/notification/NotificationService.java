/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-08
 * Scope: Implementation and test assistance for chat notification handling.
 */
package com.campuscouriers.notification_service.notification;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {
    private final NotificationRepository repository;
    private final ApplicationEventPublisher events;

    public NotificationService(NotificationRepository repository, ApplicationEventPublisher events) {
        this.repository = repository;
        this.events = events;
    }

    // This proxy commits before returning to the Kafka listener.
    @Transactional
    public boolean save(UUID eventId, UUID recipientId, String type, UUID errandId, String message) {
        return save(eventId, recipientId, type, errandId, null, null, message);
    }

    @Transactional
    public boolean save(UUID eventId, UUID recipientId, String type, UUID errandId,
                        UUID conversationId, UUID messageId, String message) {
        UUID id = UUID.randomUUID();
        Instant createdAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        boolean inserted = repository.insertIfAbsent(id, recipientId, eventId,
            type, errandId, conversationId, messageId, message, createdAt) == 1;
        if (inserted) {
            events.publishEvent(new NotificationSaved(recipientId,
                new NotificationResponse(id, type, message,
                    new NotificationResponse.NotificationData(errandId, conversationId, messageId),
                    createdAt, null)));
        }
        return inserted;
    }

    @Transactional
    public boolean markRead(UUID id, UUID recipientId) {
        return repository.markRead(id, recipientId, Instant.now()) > 0
            || repository.existsByIdAndRecipientId(id, recipientId);
    }

    @Transactional
    public void markAllRead(UUID recipientId) {
        repository.markAllRead(recipientId, Instant.now());
    }

}
