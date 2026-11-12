/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-08
 * Scope: Implementation and test assistance for typed notification persistence.
 */
package com.campuscouriers.notification_service.notification;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import org.hibernate.annotations.Check;

@Entity
@Check(name = "chk_notification_chat_fields", constraints = """
    (type = 'CHAT_MESSAGE' AND conversation_id IS NOT NULL AND message_id IS NOT NULL)
    OR
    (type <> 'CHAT_MESSAGE' AND conversation_id IS NULL AND message_id IS NULL)
    """)
@Table(name = "notifications",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_notification_event_recipient_type",
        columnNames = {"source_event_id", "recipient_id", "type"}),
    indexes = @Index(name = "idx_notifications_recipient_created",
        columnList = "recipient_id, created_at DESC, id DESC"))
public class Notification {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "recipient_id", nullable = false)
    private UUID recipientId;

    @Column(name = "source_event_id", nullable = false)
    private UUID sourceEventId;

    @Column(nullable = false, length = 64)
    private String type;

    @Column(name = "errand_id", nullable = false)
    private UUID errandId;

    @Column(name = "conversation_id")
    private UUID conversationId;

    @Column(name = "message_id")
    private UUID messageId;

    @Column(nullable = false, columnDefinition = "text")
    private String message;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "read_at")
    private Instant readAt;

    protected Notification() {
        // Required by JPA.
    }

    public Notification(UUID recipientId, UUID sourceEventId, String type,
                        UUID errandId, UUID conversationId, UUID messageId, String message) {
        this.recipientId = recipientId;
        this.sourceEventId = sourceEventId;
        this.type = type;
        this.errandId = errandId;
        this.conversationId = conversationId;
        this.messageId = messageId;
        this.message = message;
    }

    public UUID getId() { return id; }
    public UUID getRecipientId() { return recipientId; }
    public UUID getSourceEventId() { return sourceEventId; }
    public String getType() { return type; }
    public UUID getErrandId() { return errandId; }
    public UUID getConversationId() { return conversationId; }
    public UUID getMessageId() { return messageId; }
    public String getMessage() { return message; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getReadAt() { return readAt; }
}
