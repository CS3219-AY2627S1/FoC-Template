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

    @Transactional
    public void process(PenaltyScoreEvent event, int penaltyChange) {

        // Record the event first. Duplicate event IDs will fail here.
        mongoTemplate.insert(
                new ProcessedPenaltyEvent(
                        event.eventId(),
                        event.eventType(),
                        event.courierId(),
                        Instant.now()
                )
        );

        // Apply the penalty only after successfully recording the event.
        userService.adjustPenalty(
                event.courierId(),
                penaltyChange
        );
    }
}