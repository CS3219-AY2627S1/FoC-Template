package sg.edu.nus.foc.user.model;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import sg.edu.nus.foc.user.event.PenaltyScoreEvent;

/** The _id is the courier/sequence slot, so a position cannot have two owners. */
@Document("penalty_event_inbox")
public record PenaltyInboxItem(@Id String id, PenaltyScoreEvent event,
        Instant receivedAt, Instant appliedAt) { }
