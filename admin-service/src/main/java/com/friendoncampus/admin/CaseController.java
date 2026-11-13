package com.friendoncampus.admin;

import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;

@RestController
@SecurityRequirement(name = "userBearer")
public class CaseController {
    private final CaseService cases;
    public CaseController(CaseService cases) { this.cases = cases; }
    @PostMapping("/api/admin/reports")
    public ResponseEntity<String> report(@AuthenticationPrincipal Jwt actor, @RequestHeader("Idempotency-Key") UUID key, @Valid @RequestBody ReportRequest request) {
        return mutation(cases.report(actor, key, request.orderId(), request.description()));
    }
    @GetMapping("/api/admin/reports/{caseId}")
    public CaseViews.ParticipantReport status(@AuthenticationPrincipal Jwt actor, @PathVariable UUID caseId) { return cases.reportStatus(actor, caseId); }
    @GetMapping("/api/admin/orders/{orderId}/report-context")
    public ResponseEntity<CaseService.ReportContext> context(@AuthenticationPrincipal Jwt actor,@PathVariable UUID orderId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(cases.reportContext(actor,orderId));
    }
    @GetMapping("/api/admin/cases")
    public CaseViews.Page queue(@AuthenticationPrincipal Jwt actor, @RequestParam(required=false) AdminCase.State status,
            @RequestParam(required=false) UUID query, @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        return cases.queue(actor, status, query, page, size);
    }
    @GetMapping("/api/admin/cases/{caseId}")
    public CaseViews.Detail detail(@AuthenticationPrincipal Jwt actor, @PathVariable UUID caseId) { return cases.detail(actor, caseId); }
    @PostMapping("/api/admin/cases/{caseId}/claim")
    public ResponseEntity<String> claim(@AuthenticationPrincipal Jwt actor, @PathVariable UUID caseId,
            @RequestHeader("Idempotency-Key") UUID key, @Valid @RequestBody ClaimRequest request) {
        return mutation(cases.claim(actor, key, caseId, request.expectedRevision()));
    }
    private ResponseEntity<String> mutation(CaseViews.Mutation result) {
        return ResponseEntity.status(result.status()).cacheControl(CacheControl.noStore())
                .contentType(result.status() >= 400 ? MediaType.APPLICATION_PROBLEM_JSON : MediaType.APPLICATION_JSON).body(result.body());
    }
    @PostMapping("/api/admin/cases/{caseId}/conversations")
    public ResponseEntity<String> conversation(@AuthenticationPrincipal Jwt actor, @PathVariable UUID caseId,
            @RequestHeader("Idempotency-Key") UUID key, @Valid @RequestBody ConversationRequest request) {
        return mutation(cases.openConversation(actor, key, caseId, request.participantUserId()));
    }
    @GetMapping("/api/admin/cases/{caseId}/conversations")
    public ResponseEntity<java.util.List<ChatConversationClient.Conversation>> conversations(@AuthenticationPrincipal Jwt actor, @PathVariable UUID caseId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(cases.confirmedConversations(actor,caseId,false));
    }
    @GetMapping("/api/admin/reports/{caseId}/conversations")
    public ResponseEntity<java.util.List<ChatConversationClient.Conversation>> ownConversations(@AuthenticationPrincipal Jwt actor, @PathVariable UUID caseId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(cases.confirmedConversations(actor,caseId,true));
    }
    public record ConversationRequest(@NotNull UUID participantUserId) { }
    public record ReportRequest(@NotNull UUID orderId, @NotBlank @Size(max=2000) String description) { }
    public record ClaimRequest(@NotNull @Min(0) Long expectedRevision) { }
}
