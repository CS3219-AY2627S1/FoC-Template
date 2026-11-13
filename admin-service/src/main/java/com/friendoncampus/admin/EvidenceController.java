package com.friendoncampus.admin;

import java.util.UUID;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;

@RestController
public class EvidenceController {
    private final TimelineService timeline;
    private final EvidenceExportService exports;
    public EvidenceController(TimelineService timeline,EvidenceExportService exports){this.timeline=timeline;this.exports=exports;}
    @GetMapping("/api/admin/cases/{caseId}/timeline")
    @SecurityRequirement(name="userBearer")
    public ResponseEntity<JsonNode> timeline(@AuthenticationPrincipal Jwt actor,@PathVariable UUID caseId,
            @RequestParam(required=false) String cursor,@RequestParam(defaultValue="20") int limit){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(timeline.read(actor,caseId,cursor,limit));
    }
    @GetMapping("/internal/admin/orders/{orderId}/evidence")
    @SecurityRequirement(name="serviceBearer")
    public ResponseEntity<EvidenceExportService.Export> export(@PathVariable UUID orderId,@RequestParam UUID caseId,
            @RequestParam(required=false) String cursor,@RequestParam(defaultValue="20") int limit){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(exports.read(orderId,caseId,cursor,limit));
    }
}
