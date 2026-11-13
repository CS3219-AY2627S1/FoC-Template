package com.friendoncampus.credit.integration;

import java.time.OffsetDateTime;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.credit.domain.CreditInboxEvent;
import com.friendoncampus.credit.domain.InboxEventStatus;
import com.friendoncampus.credit.repository.CreditInboxEventRepository;

@Service
public class CreditInboxReceiptService {

    private final CreditInboxEventRepository inbox;
    private final EventPayloadCodec payloadCodec;

    public CreditInboxReceiptService(
            CreditInboxEventRepository inbox,
            EventPayloadCodec payloadCodec) {
        this.inbox = inbox;
        this.payloadCodec = payloadCodec;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Receipt register(CreditEventEnvelope envelope) {
        EventPayloadCodec.CanonicalPayload actor = payloadCodec.canonicalize(envelope.actorJson());
        EventPayloadCodec.CanonicalPayload payload = payloadCodec.canonicalize(envelope.payloadJson());
        OffsetDateTime occurredAt = EventTimestampPrecision.forPostgres(envelope.occurredAt());
        int inserted = inbox.insertReceivedIfAbsent(
                envelope.eventId(),
                envelope.eventType(),
                envelope.eventVersion(),
                envelope.aggregateType(),
                envelope.aggregateId(),
                envelope.aggregateVersion(),
                occurredAt,
                envelope.producer(),
                envelope.correlationId(),
                envelope.causationId(),
                actor.json(),
                payload.hash());
        CreditInboxEvent stored = inbox.findByEventIdForUpdate(envelope.eventId())
                .orElseThrow(() -> new IllegalStateException("Registered inbox event is missing"));
        requireSameEnvelope(stored, envelope, occurredAt, actor.json(), payload.hash());
        return new Receipt(stored.getStatus(), inserted == 0);
    }

    private static void requireSameEnvelope(
            CreditInboxEvent stored,
            CreditEventEnvelope received,
            OffsetDateTime occurredAt,
            String actorJson,
            String payloadHash) {
        boolean matches = stored.getEventType().equals(received.eventType())
                && stored.getEventVersion() == received.eventVersion()
                && stored.getAggregateType().equals(received.aggregateType())
                && stored.getAggregateId().equals(received.aggregateId())
                && stored.getAggregateVersion() == received.aggregateVersion()
                && stored.getOccurredAt().isEqual(occurredAt)
                && stored.getProducer().equals(received.producer())
                && stored.getCorrelationId().equals(received.correlationId())
                && Objects.equals(stored.getCausationId(), received.causationId())
                && stored.getActorJson().equals(actorJson)
                && stored.getPayloadHash().equals(payloadHash);
        if (!matches) {
            throw new EventReplayConflictException(received.eventId());
        }
    }

    public record Receipt(InboxEventStatus status, boolean duplicateDelivery) {
    }
}
