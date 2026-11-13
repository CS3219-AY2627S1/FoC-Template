package com.friendoncampus.admin;

import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;

@RestController
public class AdminController {
    private final UserEligibilityClient users;
    private final CaseAccessService access;
    public AdminController(UserEligibilityClient users, CaseAccessService access) { this.users = users; this.access = access; }

    @GetMapping("/api/admin/session")
    @SecurityRequirement(name = "userBearer")
    public Session session(@AuthenticationPrincipal Jwt jwt) {
        UUID userId = UUID.fromString(jwt.getSubject());
        var eligibility = users.find(userId);
        if (!eligibility.active() || !eligibility.administrator())
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "An active administrator account is required");
        return new Session(userId, "ADMIN");
    }
    @GetMapping("/internal/admin/cases/{caseId}/access")
    @SecurityRequirement(name = "serviceBearer")
    public CaseAccessService.Access access(@PathVariable UUID caseId, @RequestParam UUID actorId,
            @RequestParam(required = false) UUID participantId) {
        return access.check(caseId, actorId, participantId);
    }
    public record Session(UUID userId, String role) { }
}
