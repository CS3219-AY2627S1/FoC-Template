package com.friendoncampus.admin;

import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Only the producer-owned report-eligibility route is called; no Order/database fallback. */
@Component
public class ChatEligibilityClient {
    private final URI base;
    private final ServiceTokens tokens;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    private final JsonMapper mapper = JsonMapper.builder().build();
    public ChatEligibilityClient(@Value("${app.chat.base-url}") URI base, ServiceTokens tokens) {
        if (base.getHost() == null || !("https".equals(base.getScheme()) || "http".equals(base.getScheme())))
            throw new IllegalArgumentException("Chat URL must be HTTP(S) with a host");
        this.base = base; this.tokens = tokens;
    }
    public Eligibility check(UUID orderId, UUID actorId, String actorToken) {
        try {
            URI uri = base.resolve("/internal/chat/orders/" + orderId + "/report-eligibility?userId=" + actorId);
            var request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(3))
                    .header("Authorization", "Bearer " + tokens.issue("chat-service"))
                    .header("X-Actor-Token", actorToken).header("Accept", "application/json").GET().build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw new IllegalStateException();
            var data = mapper.readTree(response.body());
            var coverage = data.path("coverage");
            if (!orderId.toString().equals(data.path("orderId").asText()) || !actorId.toString().equals(data.path("userId").asText())
                    || !data.path("eligible").isBoolean() || !data.path("evidenceRevision").isString()
                    || data.path("evidenceRevision").asText().isBlank() || !coverage.path("blockingGaps").isArray()
                    || !coverage.path("checkpoints").isArray() || !coverage.path("asOf").isString()) throw new IllegalStateException();
            Instant.parse(coverage.path("asOf").asText());
            boolean complete = "COMPLETE".equals(coverage.path("status").asText()) && coverage.path("blockingGaps").isEmpty()
                    && !coverage.path("checkpoints").isEmpty();
            boolean orderCheckpoint = false;
            var streams = new java.util.HashSet<String>();
            for (var checkpoint : coverage.path("checkpoints")) {
                if (!checkpoint.path("committedSequence").isIntegralNumber() || !checkpoint.path("projectedSequence").isIntegralNumber()
                        || !checkpoint.path("committedSequence").canConvertToLong() || !checkpoint.path("projectedSequence").canConvertToLong()
                        || checkpoint.path("source").asText().isBlank() || checkpoint.path("stream").asText().isBlank()
                        || !checkpoint.path("aggregateId").isString() || !checkpoint.path("checkedAt").isString()
                        || checkpoint.path("committedSequence").asLong() < 0
                        || checkpoint.path("projectedSequence").asLong() < checkpoint.path("committedSequence").asLong()) complete = false;
                UUID aggregate = UUID.fromString(checkpoint.path("aggregateId").asText());
                String source = checkpoint.path("source").asText(), stream = checkpoint.path("stream").asText();
                if (!streams.add(source + "/" + stream + "/" + aggregate)) complete = false;
                if ("order-service".equals(source) && "order.lifecycle.events".equals(stream) && orderId.equals(aggregate)) orderCheckpoint = true;
                Instant.parse(checkpoint.path("checkedAt").asText());
            }
            return new Eligibility(data.path("eligible").asBoolean(), complete && orderCheckpoint, data.path("evidenceRevision").asText());
        } catch (Exception ex) {
            if (ex instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Reporting eligibility is temporarily unavailable. Please try again.");
        }
    }
    public record Eligibility(boolean eligible, boolean complete, String evidenceRevision) { }
}
