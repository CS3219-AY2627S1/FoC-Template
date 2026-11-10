package sg.edu.nus.foc.user.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import sg.edu.nus.foc.user.event.PenaltyScoreEvent;

/** Event identity is reserved on receipt, including while waiting for earlier events. */
@Document("received_penalty_events")
public record PenaltyEventReceipt(@Id String id, PenaltyScoreEvent event, String canonicalPayload) { }
