package sg.edu.nus.foc.user.model;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("courier_penalty_streams")
public record CourierPenaltyStream(@Id String id, long lastAppliedSequence,
        boolean sequenced, boolean pending, Instant lastAttemptAt) { }
