/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-25
 * Mode: Code generation.
 * Scope: Generated the initial code and outbox job structure.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.messagingpublisher;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import sg.edu.nus.foc.user.model.OutboxEvent;
import sg.edu.nus.foc.user.repository.OutboxEventRepository;

import java.util.List;

@Component
public class OutboxPublisherJob {

    private static final Logger log =
        LoggerFactory.getLogger(OutboxPublisherJob.class);

    private final OutboxEventRepository outboxRepository;
    private final UserCreatedPublisher publisher;
    private final MongoTemplate mongoTemplate;
    private final int batchSize;

    public OutboxPublisherJob(
            OutboxEventRepository outboxRepository,
            UserCreatedPublisher publisher,
            MongoTemplate mongoTemplate,
            @Value("${user.messaging.outbox.batch-size:50}")
            int batchSize) {

        this.outboxRepository = outboxRepository;
        this.publisher = publisher;
        this.mongoTemplate = mongoTemplate;
        this.batchSize = batchSize;
    }

    @Scheduled(
        cron = "${user.messaging.outbox.recovery-cron:0 */1 * * * *}"
    )
    public void publishPendingEvents() {
        Query query = Query.query(
            Criteria.where("status").is("PENDING")
        ).with(Sort.by(Sort.Direction.ASC, "createdAt"))
         .limit(batchSize);

        List<OutboxEvent> events =
            mongoTemplate.find(query, OutboxEvent.class);

        for (OutboxEvent event : events) {
            if (!"UserCreated".equals(event.getEventType())) {
                continue;
            }

            try {
                publisher.publish(event.getId(), event.getPayload());

                event.markPublished();
                outboxRepository.save(event);

                log.info("Published user-created event {}",
                    event.getId());

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();

                log.warn(
                    "Interrupted while publishing outbox event {}",
                    event.getId(),
                    e
                );

                return;
            } catch (Exception e) {
                log.error(
                    "Failed to publish outbox event {}; it remains pending",
                    event.getId(),
                    e
                );
            }
        }
    }
}