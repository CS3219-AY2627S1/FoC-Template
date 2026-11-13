/* AI Assistance Disclosure: OpenAI Codex, 2026-10-29. Admin resolution and strict compensation receiver; review pending. */
package sg.edu.nus.foc.reporting.resolution;

import java.util.*;
import java.nio.charset.StandardCharsets;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.Validator;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import sg.edu.nus.foc.reporting.error.*;
import sg.edu.nus.foc.reporting.report.ReportResolutionStore;
import sg.edu.nus.foc.reporting.resolution.ResolutionMessages.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@RestController
@ConditionalOnProperty(name="REPORT_RESOLUTION_ENABLED", havingValue="true")
public class ReportResolutionController {
    public static final String PUSH = "/api/reports/internal/order-resolution-compensations";
    private final ReportResolutionStore store;
    private final ReportResultDispatcher dispatcher;
    private final ResolutionSettings settings;
    private final JsonMapper json;
    private final Validator validator;
    public ReportResolutionController(ReportResolutionStore store, ReportResultDispatcher dispatcher,
            ResolutionSettings settings, JsonMapper json, Validator validator) {
        this.store=store; this.dispatcher=dispatcher; this.settings=settings; this.json=json; this.validator=validator;
    }
    @PutMapping("/api/reports/internal/order-resolutions/{commandId}")
    @PreAuthorize("@callerRoles.isAdmin(authentication)")
    @Operation(summary="Resolve an order-linked report atomically for the Order coordinator")
    @ApiResponse(responseCode="200", description="Durable APPLIED or NO_EFFECT decision; no callback into Order")
    @ApiResponse(responseCode="403", description="Not an active admin or admin binding differs")
    @ApiResponse(responseCode="409", description="Command binding or reply conflicts")
    public Resolution resolve(@PathVariable String commandId, @Valid @RequestBody Command command,
            @AuthenticationPrincipal Jwt jwt) {
        if (!commandId.equals(command.commandId())) throw new BadRequestException("Command path/body differ.", "commandId");
        if (!jwt.getSubject().equals(command.adminId())) throw new ForbiddenException("Admin binding differs from caller.");
        return store.resolve(command);
    }
    @PostMapping(PUSH)
    @Operation(summary="Restore or fence a Report resolution from an authenticated Pub/Sub compensation")
    @ApiResponse(responseCode="204", description="Compensation, dedup decision and result outbox durably committed")
    @ApiResponse(responseCode="400", description="Invalid event or subscription")
    @ApiResponse(responseCode="409", description="Event or command binding conflicts")
    public ResponseEntity<Void> compensate(@RequestBody JsonNode envelope) {
        Compensation request;
        try {
            if (!settings.subscription().equals(envelope.path("subscription").asString())) throw new IllegalArgumentException();
            var message = envelope.path("message");
            if (message.path("data").asString().length() > 16384) throw new IllegalArgumentException();
            var payload = json.readTree(Base64.getDecoder().decode(message.path("data").asString()));
            if (!new HashSet<>(payload.propertyNames()).equals(Set.of("eventId","commandId","reportId","orderId","requesterId","courierId","adminId","generation")))
                throw new IllegalArgumentException();
            if (!payload.path("generation").isIntegralNumber() || payload.path("generation").asLong()!=2) throw new IllegalArgumentException();
            for (String field : List.of("eventId","commandId","reportId","orderId","requesterId","adminId"))
                if (!payload.path(field).isString()) throw new IllegalArgumentException();
            if (!payload.path("courierId").isNull() && !payload.path("courierId").isString()) throw new IllegalArgumentException();
            request = json.treeToValue(payload, Compensation.class);
            if (!validator.validate(request).isEmpty()) throw new IllegalArgumentException();
            UUID.fromString(request.eventId());
            var attrs = message.path("attributes");
            if (!request.eventId().equals(attrs.path("eventId").asString())
                    || !"ReportResolutionCompensationRequested".equals(attrs.path("eventType").asString())
                    || !"1".equals(attrs.path("eventVersion").asString())) throw new IllegalArgumentException();
        } catch (RuntimeException bad) { throw new BadRequestException("Invalid Report compensation envelope.", null); }
        store.compensate(request);
        dispatcher.dispatch(request.eventId());
        return ResponseEntity.noContent().build();
    }
}
