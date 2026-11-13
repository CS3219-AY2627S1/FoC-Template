package sg.edu.nus.foc.user.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document("processed_penalty_events")
public class ProcessedPenaltyEvent {

    // Prevents MongoDB from recording the same event twice
    @Id
    private String eventId;

    private String courierId;
    private String eventType;
    private Instant processedAt;

    public ProcessedPenaltyEvent() {}

    public ProcessedPenaltyEvent(
            String eventId,
            String courierId,
            String eventType,
            Instant processedAt) {
        this.eventId = eventId;
        this.courierId = courierId;
        this.eventType = eventType;
        this.processedAt = processedAt;
    }

    public String getEventId() {
        return this.eventId;
    }

    public String getCourierId() {
        return this.courierId;
    }

    public String getEventType() {
        return this.eventType;
    }

    public Instant getProcessedAt() {
        return this.processedAt;
    }
}