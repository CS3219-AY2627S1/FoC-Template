/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-25
 * Mode: Code generation.
 * Scope: Generated the initial code and outbox job structure.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document("outbox_events")
public class OutboxEvent {

    @Id
    private String id;

    private String eventType;
    private String payload;
    private String status;
    private Instant createdAt;
    private Instant publishedAt;

    protected OutboxEvent() {}

    public OutboxEvent(String id, String eventType, String payload) {
        this.id = id;
        this.eventType = eventType;
        this.payload = payload;
        this.status = "PENDING";
        this.createdAt = Instant.now();
    }

    public String getId() {
        return id;
    }

    public String getEventType() {
        return eventType;
    }

    public String getPayload() {
        return payload;
    }

    public String getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }

    public void markPublished() {
        this.status = "PUBLISHED";
        this.publishedAt = Instant.now();
    }
}