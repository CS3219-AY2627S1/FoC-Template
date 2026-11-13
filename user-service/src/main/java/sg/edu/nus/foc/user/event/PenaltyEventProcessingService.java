package sg.edu.nus.foc.user.event;

import java.time.Instant;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

import sg.edu.nus.foc.user.logic.UserService;
import sg.edu.nus.foc.user.model.ProcessedPenaltyEvent;

@Service
@RequiredArgsConstructor
public class PenaltyEventProcessingService {

    private final MongoTemplate mongoTemplate;
    private final UserService userService;
    private final PenaltySequenceStore sequences;

    @Transactional
    public void process(PenaltyScoreEvent event, int penaltyChange) {
        if (wasProcessed(event.eventId())) return;
        sequences.claimLegacy(event.courierId());
        // Record the event first. Duplicate event IDs will fail here.
        mongoTemplate.insert(
                new ProcessedPenaltyEvent(
                        event.eventId(),
                        event.courierId(),
                        event.eventType(),
                        Instant.now()
                )
        );

        // Apply the penalty only after successfully recording the event.
        userService.adjustPenalty(
                event.courierId(),
                penaltyChange
        );
    }

    public boolean wasProcessed(String eventId) {
        return mongoTemplate.exists(org.springframework.data.mongodb.core.query.Query.query(
                org.springframework.data.mongodb.core.query.Criteria.where("_id").is(eventId)), ProcessedPenaltyEvent.class);
    }
}
