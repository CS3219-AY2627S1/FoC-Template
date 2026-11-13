package sg.edu.nus.foc.user.event;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import sg.edu.nus.foc.user.logic.UserService;
import sg.edu.nus.foc.user.model.*;
import tools.jackson.databind.json.JsonMapper;

/** All receipt/apply boundaries are Mongo transactions; the processor invokes this proxy. */
@Service
@RequiredArgsConstructor
@Slf4j
public class PenaltySequenceStore {
    private final MongoTemplate mongo;
    private final UserService users;
    private final JsonMapper json;

    @Transactional
    public void accept(PenaltyScoreEvent event) {
        // Mongo dates have millisecond precision; compare the original canonical wire
        // representation so a nanosecond occurredAt remains an identical retry.
        String canonicalPayload = json.writeValueAsString(event);
        PenaltyEventReceipt previous = mongo.findById(event.eventId(), PenaltyEventReceipt.class);
        if (previous != null) {
            if (!previous.canonicalPayload().equals(canonicalPayload)) throw conflict("Penalty event ID has different content.");
            return;
        }
        if (mongo.exists(id(event.eventId()), ProcessedPenaltyEvent.class)) {
            throw conflict("An already processed legacy event cannot be assigned a new sequence.");
        }
        String slot = slot(event.courierId(), event.courierSequence());
        if (mongo.findById(slot, PenaltyInboxItem.class) != null) {
            throw conflict("Courier sequence is already bound to another penalty event.");
        }
        mongo.insert(new PenaltyEventReceipt(event.eventId(), event, canonicalPayload));
        mongo.insert(new PenaltyInboxItem(slot, event, Instant.now(), null));
        mongo.upsert(id(event.courierId()), new Update()
                .setOnInsert("lastAppliedSequence", 0L)
                .set("sequenced", true).set("pending", true).set("lastAttemptAt", Instant.EPOCH), CourierPenaltyStream.class);
    }

    @Transactional
    public boolean applyNext(String courierId) {
        CourierPenaltyStream stream = mongo.findById(courierId, CourierPenaltyStream.class);
        if (stream == null || !stream.sequenced()) return false;
        long next = Math.addExact(stream.lastAppliedSequence(), 1L);
        PenaltyInboxItem item = mongo.findById(slot(courierId, next), PenaltyInboxItem.class);
        Query owned = id(courierId).addCriteria(Criteria.where("lastAppliedSequence").is(stream.lastAppliedSequence()));
        if (item == null) {
            boolean gap = mongo.exists(Query.query(Criteria.where("event.courierId").is(courierId)
                    .and("event.courierSequence").gt(stream.lastAppliedSequence())), PenaltyInboxItem.class);
            mongo.updateFirst(owned, new Update().set("pending", gap).set("lastAttemptAt", Instant.now()), CourierPenaltyStream.class);
            if (gap) log.warn("Penalty stream {} is waiting for sequence {}; later events remain durable", courierId, next);
            return false;
        }
        PenaltyScoreEvent event = item.event();
        mongo.insert(new ProcessedPenaltyEvent(event.eventId(), event.courierId(), event.eventType(), Instant.now()));
        users.adjustPenalty(courierId, "PenaltyScoreAdditionEvent".equals(event.eventType())
                ? event.penaltyAmount() : -event.penaltyAmount());
        long changed = mongo.updateFirst(owned, new Update().set("lastAppliedSequence", next)
                .set("pending", true).set("lastAttemptAt", Instant.now()), CourierPenaltyStream.class).getMatchedCount();
        if (changed != 1) throw conflict("Penalty stream advanced concurrently; retry processing.");
        mongo.updateFirst(id(item.id()), new Update().set("appliedAt", Instant.now()), PenaltyInboxItem.class);
        log.info("Applied penalty event {} for courier {} at sequence {}", event.eventId(), courierId, next);
        return true;
    }

    /** Serialize legacy effects with stream activation; never mix first deliveries after cutover. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void claimLegacy(String courierId) {
        CourierPenaltyStream stream = mongo.findById(courierId, CourierPenaltyStream.class);
        if (stream != null && stream.sequenced()) throw conflict("Legacy penalty backlog must be reconciled before sequenced events.");
        mongo.upsert(id(courierId), new Update().setOnInsert("lastAppliedSequence", 0L)
                .setOnInsert("sequenced", false).setOnInsert("pending", false)
                .setOnInsert("lastAttemptAt", Instant.EPOCH).set("legacyTouchedAt", Instant.now()), CourierPenaltyStream.class);
    }

    /** Outside the failed score transaction so repeatedly failing streams cannot starve others. */
    public void deferRetry(String courierId) {
        mongo.updateFirst(id(courierId).addCriteria(Criteria.where("pending").is(true)),
                new Update().set("lastAttemptAt", Instant.now()), CourierPenaltyStream.class);
    }

    public List<String> pendingStreams() {
        return mongo.find(Query.query(Criteria.where("pending").is(true))
                .with(Sort.by("lastAttemptAt").ascending()).limit(50), CourierPenaltyStream.class)
                .stream().map(CourierPenaltyStream::id).toList();
    }

    private static Query id(String value) { return Query.query(Criteria.where("_id").is(value)); }
    private static String slot(String courier, long sequence) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(courier.getBytes(StandardCharsets.UTF_8)) + ":" + sequence;
    }
    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
