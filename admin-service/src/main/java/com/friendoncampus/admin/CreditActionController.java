package com.friendoncampus.admin;

import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import tools.jackson.databind.JsonNode;

@RestController
@SecurityRequirement(name="userBearer")
public class CreditActionController {
    private final CreditActionService actions;
    public CreditActionController(CreditActionService actions){this.actions=actions;}
    public record ActionRequest(@NotBlank String type,@NotNull UUID targetUserId,@Schema(type="integer",format="int32") JsonNode amount,@NotBlank @Size(max=2000) String reason) { }
    @PostMapping("/api/admin/cases/{caseId}/actions")
    public ResponseEntity<String> create(@AuthenticationPrincipal Jwt actor,@PathVariable UUID caseId,@RequestHeader("Idempotency-Key") UUID key,@Valid @RequestBody ActionRequest request){
        var result=actions.create(actor,caseId,key,request.type(),request.targetUserId(),request.amount(),request.reason());
        return ResponseEntity.status(result.status()).cacheControl(CacheControl.noStore()).contentType(MediaType.APPLICATION_JSON).body(result.body());
    }
    @GetMapping("/api/admin/cases/{caseId}/actions/{operationId}")
    public ResponseEntity<CreditActionService.Action> read(@AuthenticationPrincipal Jwt actor,@PathVariable UUID caseId,@PathVariable UUID operationId){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(actions.read(actor,caseId,operationId));
    }
}
