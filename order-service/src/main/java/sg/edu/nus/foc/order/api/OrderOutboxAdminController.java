package sg.edu.nus.foc.order.api;

import java.time.Instant;
import java.util.Map;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import sg.edu.nus.foc.order.application.OrderOutboxAfterCommitListener;
import sg.edu.nus.foc.order.application.OrderOutboxDispatchRequested;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.order.security.annotation.RequireAdminRole;

@RestController
@RequestMapping("/api/orders/internal/outbox")
@SecurityRequirement(name = "bearerAuth")
@RequiredArgsConstructor
public class OrderOutboxAdminController {
    private static final Logger LOG = LoggerFactory.getLogger(OrderOutboxAdminController.class);
    private final OrderEventOutboxRepository outbox;
    private final OrderOutboxAfterCommitListener publication;

    @GetMapping("/failed")
    @RequireAdminRole
    @Operation(summary = "List retained failed event IDs for operator recovery")
    @ApiResponse(responseCode = "200", description = "Bounded failed event IDs; no financial payload exposed")
    public Map<String, Object> failed(@RequestParam(defaultValue = "50") int limit) {
        if (limit < 1 || limit > 100) throw new OrderProblem("VALIDATION_ERROR", "Limit must be 1 to 100.");
        return Map.of("eventIds", outbox.failedIds(limit));
    }

    @PostMapping("/{eventId}/redrive")
    @RequireAdminRole
    @Operation(summary = "Redrive a retained FAILED event without changing its identity or payload")
    @ApiResponse(responseCode = "202", description = "Redrive committed and publication queued")
    @ApiResponse(responseCode = "409", description = "Event is not FAILED")
    public ResponseEntity<Map<String, String>> redrive(@PathVariable String eventId) {
        outbox.redrive(eventId, Instant.now()); // REQUIRES_NEW returns only after commit.
        LOG.warn("Operator redrive requested for retained event {}", eventId);
        publication.dispatchAfterCommit(new OrderOutboxDispatchRequested(eventId));
        return ResponseEntity.accepted().body(Map.of("eventId", eventId, "state", "PENDING"));
    }
}
