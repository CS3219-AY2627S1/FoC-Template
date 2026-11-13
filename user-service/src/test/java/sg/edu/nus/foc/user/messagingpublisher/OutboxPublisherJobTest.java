/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-05
 * Mode: Code generation.
 * Scope: Generated the initial test code and provided testing assistance.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.messagingpublisher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;

import sg.edu.nus.foc.user.model.OutboxEvent;
import sg.edu.nus.foc.user.repository.OutboxEventRepository;

@ExtendWith(MockitoExtension.class)
class OutboxPublisherJobTest {

    @Mock
    private OutboxEventRepository outboxRepository;

    @Mock
    private UserCreatedPublisher publisher;

    @Mock
    private MongoTemplate mongoTemplate;

    private OutboxPublisherJob job;

    @BeforeEach
    void setUp() {
        job = new OutboxPublisherJob(
                outboxRepository,
                publisher,
                mongoTemplate,
                10
        );
    }

    @AfterEach
    void clearInterruptStatus() {
        // Prevent an interruption test from affecting other tests
        Thread.interrupted();
    }

    @Test
    void publishPendingEventsQueriesPendingEventsInAscendingOrder() {
        when(mongoTemplate.find(any(Query.class), eq(OutboxEvent.class)))
                .thenReturn(List.of());

        job.publishPendingEvents();

        ArgumentCaptor<Query> queryCaptor =
                ArgumentCaptor.forClass(Query.class);

        verify(mongoTemplate).find(
                queryCaptor.capture(),
                eq(OutboxEvent.class)
        );

        Query query = queryCaptor.getValue();

        assertThat(query.getQueryObject())
                .containsEntry("status", "PENDING");

        assertThat(query.getSortObject())
                .containsEntry("createdAt", Sort.Direction.ASC.isAscending() ? 1 : -1);

        assertThat(query.getLimit()).isEqualTo(10);
    }

    @Test
    void publishesUserCreatedEventAndMarksItPublished() throws Exception {
        OutboxEvent event = createUserCreatedEvent(
                "event-1",
                "{\"userId\":\"user-1\"}"
        );

        when(mongoTemplate.find(any(Query.class), eq(OutboxEvent.class)))
                .thenReturn(List.of(event));

        job.publishPendingEvents();

        verify(publisher).publish(
                "event-1",
                "{\"userId\":\"user-1\"}"
        );

        verify(outboxRepository).save(event);

        assertThat(event.getStatus()).isEqualTo("PUBLISHED");
    }

    @Test
    void skipsEventsWithUnsupportedEventTypes() throws Exception {
        OutboxEvent event = new OutboxEvent(
                "event-1",
                "UnsupportedEvent",
                "{}"
        );

        when(mongoTemplate.find(any(Query.class), eq(OutboxEvent.class)))
                .thenReturn(List.of(event));

        job.publishPendingEvents();

        verifyNoInteractions(publisher);
        verify(outboxRepository, never()).save(any(OutboxEvent.class));

        assertThat(event.getStatus()).isEqualTo("PENDING");
    }

    @Test
    void publishesMultipleUserCreatedEvents() throws Exception {
        OutboxEvent first = createUserCreatedEvent("event-1", "{\"userId\":\"user-1\"}");
        OutboxEvent second = createUserCreatedEvent("event-2", "{\"userId\":\"user-2\"}");

        when(mongoTemplate.find(any(Query.class), eq(OutboxEvent.class)))
                .thenReturn(List.of(first, second));

        job.publishPendingEvents();

        verify(publisher).publish("event-1", "{\"userId\":\"user-1\"}");
        verify(publisher).publish("event-2", "{\"userId\":\"user-2\"}");

        verify(outboxRepository).save(first);
        verify(outboxRepository).save(second);

        assertThat(first.getStatus()).isEqualTo("PUBLISHED");
        assertThat(second.getStatus()).isEqualTo("PUBLISHED");
    }

    @Test
    void continuesPublishingWhenAnEventFails() throws Exception {
        OutboxEvent failedEvent = createUserCreatedEvent(
                "event-1",
                "{\"userId\":\"user-1\"}"
        );

        OutboxEvent successfulEvent = createUserCreatedEvent(
                "event-2",
                "{\"userId\":\"user-2\"}"
        );

        when(mongoTemplate.find(any(Query.class), eq(OutboxEvent.class)))
                .thenReturn(List.of(failedEvent, successfulEvent));

        doThrow(new RuntimeException("Pub/Sub unavailable"))
                .when(publisher)
                .publish("event-1", "{\"userId\":\"user-1\"}");

        job.publishPendingEvents();

        // The failed event remains pending
        assertThat(failedEvent.getStatus()).isEqualTo("PENDING");
        verify(outboxRepository, never()).save(failedEvent);

        // The next event is still processed
        verify(publisher).publish("event-2", "{\"userId\":\"user-2\"}");
        verify(outboxRepository).save(successfulEvent);

        assertThat(successfulEvent.getStatus()).isEqualTo("PUBLISHED");
    }

    @Test
    void stopsProcessingAndRestoresInterruptStatusWhenInterrupted() throws Exception {
        OutboxEvent interruptedEvent = createUserCreatedEvent(
                "event-1",
                "{\"userId\":\"user-1\"}"
        );

        OutboxEvent nextEvent = createUserCreatedEvent(
                "event-2",
                "{\"userId\":\"user-2\"}"
        );

        when(mongoTemplate.find(any(Query.class), eq(OutboxEvent.class)))
                .thenReturn(List.of(interruptedEvent, nextEvent));

        doThrow(new InterruptedException("Publishing interrupted"))
                .when(publisher)
                .publish("event-1", "{\"userId\":\"user-1\"}");

        try {
            job.publishPendingEvents();

            assertThat(Thread.currentThread().isInterrupted()).isTrue();

            // The interrupted event is not marked as published
            assertThat(interruptedEvent.getStatus()).isEqualTo("PENDING");
            verify(outboxRepository, never()).save(interruptedEvent);

            // Processing stops; subsequent events are not published
            verify(publisher, never()).publish(
                    "event-2",
                    "{\"userId\":\"user-2\"}"
            );

            verify(outboxRepository, never()).save(nextEvent);
        } finally {
            Thread.interrupted();
        }
    }

    private OutboxEvent createUserCreatedEvent(
            String eventId,
            String payload
    ) {
        return new OutboxEvent(eventId, "UserCreated", payload);
    }
}