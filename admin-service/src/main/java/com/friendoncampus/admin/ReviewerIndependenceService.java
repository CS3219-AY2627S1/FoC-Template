package com.friendoncampus.admin;

import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Chat owns the complete historical participant list. Never infer independence from reports.
 * Callbacks use only a bounded local proof, so Chat authorization cannot recurse into Chat.
 */
@Service
public class ReviewerIndependenceService {
    static final String INVOLVED = "You cannot review this case because you requested the errand or were one of its couriers. An independent administrator must review it.";
    static final String UNAVAILABLE = "Reviewer independence could not be verified. Refresh the evidence and try again. The case remains open.";
    private final JdbcTemplate db;
    private final ChatTimelineClient chat;
    private final long maxAge;
    private final JsonMapper json = JsonMapper.builder().build();

    public ReviewerIndependenceService(JdbcTemplate db, ChatTimelineClient chat,
            @Value("${app.resolution.evidence-max-age-seconds:60}") long maxAge) {
        if (maxAge < 1) throw new IllegalArgumentException("Evidence age must be positive");
        this.db = db; this.chat = chat; this.maxAge = maxAge;
    }

    public void verify(Jwt actor, UUID caseId, UUID orderId) {
        try {
            remember(caseId, orderId, chat.fetch(caseId, orderId, actor.getTokenValue(), null, 100));
        } catch (RuntimeException ex) {
            invalidate(caseId);
            throw unavailable();
        }
        require(caseId, orderId, UUID.fromString(actor.getSubject()));
    }

    // The participant list and coverage are snapshot-wide, independent of record pagination.
    public void remember(UUID caseId, UUID orderId, JsonNode evidence) {
        try {
            EvidenceValidation.timeline(evidence, caseId, orderId);
            var coverage = evidence.path("coverage");
            EvidenceValidation.require("COMPLETE".equals(coverage.path("status").asText()));
            Instant now = Instant.now(), until = expiry(coverage.path("asOf").asText(), now);
            long sequence = -1;
            for (var cp : coverage.path("checkpoints")) {
                Instant expires = expiry(cp.path("checkedAt").asText(), now);
                if (expires.isBefore(until)) until = expires;
                if ("order-service".equals(cp.path("source").asText())
                        && "order.lifecycle.events".equals(cp.path("stream").asText())
                        && orderId.toString().equals(cp.path("aggregateId").asText()))
                    sequence = cp.path("committedSequence").asLong();
            }
            EvidenceValidation.require(sequence >= 0);
            Set<String> involved = new TreeSet<>();
            for (var p : evidence.path("participants")) involved.add(UUID.fromString(p.path("userId").asText()).toString());
            involved.add(UUID.fromString(evidence.path("order").path("requesterId").asText()).toString());
            if (!evidence.path("order").path("courierId").isNull())
                involved.add(UUID.fromString(evidence.path("order").path("courierId").asText()).toString());
            // A COMPLETE response must not contradict its own historical Order facts.
            for (var r : evidence.path("records")) if ("ORDER".equals(r.path("data").path("kind").asText())) {
                for (String field : List.of("requesterId", "courierId", "previousCourierId")) {
                    var value = r.path("data").path(field);
                    EvidenceValidation.require(value.isNull() || involved.contains(UUID.fromString(value.asText()).toString()));
                }
                for (String field : List.of("requesterId", "courierId")) {
                    var value = r.path("data").path("snapshot").path(field);
                    EvidenceValidation.require(value.isNull() || involved.contains(UUID.fromString(value.asText()).toString()));
                }
            }
            // Never replace newer Order history with an older pinned snapshot. Once observed,
            // involvement cannot disappear from a later proof, even if a producer contradicts itself.
            db.update("""
                INSERT INTO admin_reviewer_evidence(case_id,order_id,evidence_revision,order_sequence,involved_ids,valid_until)
                VALUES (?,?,?,?,?,?) ON CONFLICT(case_id) DO UPDATE SET
                evidence_revision=EXCLUDED.evidence_revision,order_sequence=EXCLUDED.order_sequence,
                involved_ids=(SELECT jsonb_agg(DISTINCT value)::text FROM jsonb_array_elements(
                    admin_reviewer_evidence.involved_ids::jsonb || EXCLUDED.involved_ids::jsonb)),
                valid_until=EXCLUDED.valid_until
                WHERE admin_reviewer_evidence.order_id=EXCLUDED.order_id
                  AND admin_reviewer_evidence.order_sequence<=EXCLUDED.order_sequence
                """, caseId, orderId, evidence.path("evidenceRevision").asText(), sequence,
                json.writeValueAsString(involved), until.atOffset(ZoneOffset.UTC));
            // Approved dispute membership: a complete producer snapshot grants access independently
            // of statement submission. Historical membership is monotonic and never browser-supplied.
            for (String participant : involved)
                db.update("INSERT INTO admin_case_participants(case_id,user_id) VALUES (?,?) ON CONFLICT DO NOTHING", caseId, UUID.fromString(participant));
        } catch (RuntimeException ex) {
            invalidate(caseId);
            throw unavailable();
        }
    }

    private Instant expiry(String value, Instant now) {
        Instant time = Instant.parse(value);
        EvidenceValidation.require(!time.isAfter(now.plusSeconds(5)) && time.plusSeconds(maxAge).isAfter(now));
        return time.plusSeconds(maxAge);
    }

    public boolean independent(UUID caseId, UUID orderId, UUID actor) {
        var rows = db.queryForList("SELECT involved_ids,valid_until>clock_timestamp() AS fresh FROM admin_reviewer_evidence WHERE case_id=? AND order_id=?", caseId, orderId);
        if (rows.isEmpty()) throw unavailable();
        var row = rows.get(0);
        if (!Boolean.TRUE.equals(row.get("fresh"))) throw unavailable();
        try {
            var ids = json.readTree((String) row.get("involved_ids"));
            if (!ids.isArray() || ids.isEmpty()) throw unavailable();
            for (var id : ids) if (actor.equals(UUID.fromString(id.asText()))) return false;
            return true;
        } catch (RuntimeException ex) { throw unavailable(); }
    }

    public void require(UUID caseId, UUID orderId, UUID actor) {
        if (!independent(caseId, orderId, actor))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, INVOLVED);
    }

    public void invalidate(UUID caseId) {
        // Retain the monotonic involvement history while withdrawing its authorization lease.
        db.update("UPDATE admin_reviewer_evidence SET valid_until=CURRENT_TIMESTAMP WHERE case_id=?", caseId);
    }
    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, UNAVAILABLE);
    }
}
