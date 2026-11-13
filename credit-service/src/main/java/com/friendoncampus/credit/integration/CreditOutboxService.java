package com.friendoncampus.credit.integration;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.credit.domain.CreditOutboxEvent;
import com.friendoncampus.credit.repository.CreditOutboxEventRepository;

@Service
public class CreditOutboxService {

    public static final String CREDIT_PRODUCER = "credit-service";

    private final CreditOutboxEventRepository outbox;
    private final EventPayloadCodec payloadCodec;

    public CreditOutboxService(
            CreditOutboxEventRepository outbox,
            EventPayloadCodec payloadCodec) {
        this.outbox = outbox;
        this.payloadCodec = payloadCodec;
    }

    @Transactional
    public CreditOutboxEvent enqueue(CreditEventEnvelope envelope) {
        if (!CREDIT_PRODUCER.equals(envelope.producer())) {
            throw new IllegalArgumentException("Credit outbox events must use the credit-service producer");
        }
        EventPayloadCodec.CanonicalPayload actor = payloadCodec.canonicalize(envelope.actorJson());
        EventPayloadCodec.CanonicalPayload payload = payloadCodec.canonicalize(envelope.payloadJson());
        CreditEventEnvelope canonicalEnvelope = new CreditEventEnvelope(
                envelope.eventId(),
                envelope.eventType(),
                envelope.eventVersion(),
                envelope.aggregateType(),
                envelope.aggregateId(),
                envelope.aggregateVersion(),
                EventTimestampPrecision.forPostgres(envelope.occurredAt()),
                envelope.producer(),
                envelope.correlationId(),
                envelope.causationId(),
                actor.json(),
                payload.json());
        outbox.insertPendingIfAbsent(
                canonicalEnvelope.eventId(),
                canonicalEnvelope.eventType(),
                canonicalEnvelope.eventVersion(),
                canonicalEnvelope.aggregateType(),
                canonicalEnvelope.aggregateId(),
                canonicalEnvelope.aggregateVersion(),
                canonicalEnvelope.occurredAt(),
                canonicalEnvelope.producer(),
                canonicalEnvelope.correlationId(),
                canonicalEnvelope.causationId(),
                canonicalEnvelope.actorJson(),
                canonicalEnvelope.payloadJson(),
                payload.hash());
        CreditOutboxEvent stored = outbox.findByEventIdForUpdate(canonicalEnvelope.eventId())
                .orElseThrow(() -> new IllegalStateException("Registered outbox event is missing"));
        requireSameEvent(stored, canonicalEnvelope, payload.hash());
        return stored;
    }

    @Transactional(readOnly = true)
    public List<CreditOutboxEvent> pending(int limit) {
        if (limit < 1 || limit > 500) {
            throw new IllegalArgumentException("Outbox batch size must be between 1 and 500");
        }
        return outbox.findPending(PageRequest.of(0, limit));
    }

    @Transactional
    public void markPublished(UUID eventId) {
        CreditOutboxEvent event = requireLocked(eventId);
        event.markPublished();
        outbox.save(event);
    }

    @Transactional
    public void recordPublishFailure(UUID eventId, Throwable failure) {
        CreditOutboxEvent event = requireLocked(eventId);
        event.markPublishFailed(failure.getMessage());
        outbox.save(event);
    }

    private CreditOutboxEvent requireLocked(UUID eventId) {
        return outbox.findByEventIdForUpdate(eventId)
                .orElseThrow(() -> new IllegalArgumentException("Outbox event does not exist"));
    }

    private static void requireSameEvent(
            CreditOutboxEvent stored,
            CreditEventEnvelope received,
            String payloadHash) {
        boolean matches = stored.getEventType().equals(received.eventType())
                && stored.getEventVersion() == received.eventVersion()
                && stored.getAggregateType().equals(received.aggregateType())
                && stored.getAggregateId().equals(received.aggregateId())
                && stored.getAggregateVersion() == received.aggregateVersion()
                && stored.getOccurredAt().isEqual(received.occurredAt())
                && stored.getProducer().equals(received.producer())
                && stored.getCorrelationId().equals(received.correlationId())
                && java.util.Objects.equals(stored.getCausationId(), received.causationId())
                && stored.getActorJson().equals(received.actorJson())
                && stored.getPayloadHash().equals(payloadHash);
        if (!matches) {
            throw new EventReplayConflictException(received.eventId());
        }
    }
}
