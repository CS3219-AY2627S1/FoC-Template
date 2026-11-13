package com.friendoncampus.admin;

import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
public class ResolutionController {
    private final ResolutionService service;
    public ResolutionController(ResolutionService service){this.service=service;}
    public record ResolveRequest(@NotBlank @Size(max=2000) String resolution,@NotNull @Min(0) Long expectedRevision,
        @Size(max=1000) List<ResolutionService.Explanation> rejectedActionExplanations, String creditDisposition) { }
    @PostMapping("/api/admin/cases/{caseId}/resolve")
    public ResponseEntity<String> resolve(@AuthenticationPrincipal Jwt actor,@PathVariable UUID caseId,
        @RequestHeader("Idempotency-Key") UUID key,@Valid @RequestBody ResolveRequest body){
        var result=body.creditDisposition()==null?service.resolve(actor,caseId,key,body.resolution(),body.expectedRevision(),body.rejectedActionExplanations()):service.resolve(actor,caseId,key,body.resolution(),body.expectedRevision(),body.rejectedActionExplanations(),body.creditDisposition());
        return ResponseEntity.status(result.status()).contentType(MediaType.APPLICATION_JSON).cacheControl(CacheControl.noStore()).body(result.body());
    }
}
