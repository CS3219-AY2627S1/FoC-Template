package sg.edu.nus.foc.order.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "order_event_outbox")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrderEventOutbox {
    @Id
    @Column(name = "event_id", length = 36)
    private String eventId;

    // V15: command compensation may precede creation of an Order row.
    @Column(name = "order_id", length = 36)
    private String orderId;

    @Column(name = "command_id", length = 128)
    private String commandId;

    @Column(name = "event_type", nullable = false, length = 100)
    private String eventType;

    @Column(name = "event_version", nullable = false)
    private int eventVersion;

    @Column(name = "order_version", nullable = false)
    private long orderVersion;

    @Column(name = "payload", nullable = false, columnDefinition = "text")
    private String payload;

    @Enumerated(EnumType.STRING)
    @Column(name = "state", nullable = false, length = 20)
    private OutboxState state;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt;

    @Column(name = "lease_until")
    private Instant leaseUntil;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "last_error", length = 2000)
    private String lastError;

    private OrderEventOutbox(
            String eventId,
            String orderId,
            String eventType,
            int eventVersion,
            long orderVersion,
            String payload,
            Instant createdAt) {
        this.eventId = eventId;
        this.orderId = orderId;
        this.eventType = eventType;
        this.eventVersion = eventVersion;
        this.orderVersion = orderVersion;
        this.payload = payload;
        this.state = OutboxState.PENDING;
        this.attemptCount = 0;
        this.createdAt = createdAt;
        this.nextAttemptAt = createdAt;
    }

    public static OrderEventOutbox pending(
            String eventId,
            String orderId,
            String eventType,
            int eventVersion,
            long orderVersion,
            String payload,
            Instant createdAt) {
        if (eventId == null || eventId.isBlank() || orderId == null || orderId.isBlank()
                || eventType == null || eventType.isBlank() || payload == null || createdAt == null) {
            throw new IllegalArgumentException("Outbox event fields are required.");
        }
        return new OrderEventOutbox(eventId, orderId, eventType, eventVersion, orderVersion, payload, createdAt);
    }

    public void claim(Instant now, Instant leaseExpiry) {
        if (state == OutboxState.PUBLISHED || state == OutboxState.FAILED
                || leaseExpiry == null || !leaseExpiry.isAfter(now)) {
            throw new IllegalStateException("Outbox entry cannot be claimed.");
        }
        state = OutboxState.IN_PROGRESS;
        attemptCount++;
        leaseUntil = leaseExpiry;
    }

    public void markPublished(Instant publishedAt) {
        if (state != OutboxState.IN_PROGRESS) {
            throw new IllegalStateException("Only a claimed outbox entry can be marked published.");
        }
        state = OutboxState.PUBLISHED;
        this.publishedAt = publishedAt;
        leaseUntil = null;
        lastError = null;
    }

    public void scheduleRetry(Instant nextAttemptAt, String error) {
        if (state != OutboxState.IN_PROGRESS || nextAttemptAt == null) {
            throw new IllegalStateException("Only a claimed outbox entry can be retried.");
        }
        state = attemptCount >= 10 ? OutboxState.FAILED : OutboxState.PENDING;
        this.nextAttemptAt = nextAttemptAt;
        leaseUntil = null;
        lastError = truncate(error);
    }

    public void redrive(Instant now) {
        if (state != OutboxState.FAILED || now == null) {
            throw new IllegalStateException("Only a retained failed event can be redriven.");
        }
        state = OutboxState.PENDING;
        attemptCount = 0;
        nextAttemptAt = now;
        leaseUntil = null;
    }

    private String truncate(String error) {
        if (error == null) {
            return "Unknown publisher failure";
        }
        return error.length() <= 2000 ? error : error.substring(0, 2000);
    }
}
