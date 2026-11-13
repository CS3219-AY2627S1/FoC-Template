package com.friendoncampus.user.web;

import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import com.friendoncampus.user.domain.UserRole;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.repository.UserRepository;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;

@RestController
public class AdminEligibilityController {
    private final UserRepository users;
    public AdminEligibilityController(UserRepository users) { this.users = users; }

    @GetMapping("/internal/users/{userId}/admin-eligibility")
    @SecurityRequirement(name = "serviceBearer")
    @Transactional(readOnly = true)
    public Eligibility eligibility(@PathVariable UUID userId) {
        var user = users.findById(userId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found"));
        return new Eligibility(userId, user.getStatus() == UserStatus.ACTIVE, user.hasRole(UserRole.ADMIN));
    }
    @GetMapping("/internal/users/{userId}/authorization")
    @SecurityRequirement(name = "serviceBearer")
    @Transactional(readOnly = true)
    public org.springframework.http.ResponseEntity<Authorization> authorization(@PathVariable UUID userId) {
        var user=users.findById(userId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,"Account not found"));
        return org.springframework.http.ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
                .body(new Authorization(userId,user.getStatus()==UserStatus.ACTIVE,user.getRoles()));
    }
    public record Authorization(UUID userId,boolean active,java.util.Set<UserRole> roles) { }
    public record Eligibility(UUID userId, boolean active, boolean administrator) { }
}
