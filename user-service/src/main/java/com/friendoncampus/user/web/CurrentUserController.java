package com.friendoncampus.user.web;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.service.PasswordChangeService;
import com.friendoncampus.user.service.UsernameChangeService;
import com.friendoncampus.user.service.RoleSessionService;
import com.friendoncampus.user.domain.UserRole;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/users")
public class CurrentUserController {
    private final UserRepository users;
    private final UsernameChangeService usernameChanges;
    private final PasswordChangeService passwordChanges;
    private final RoleSessionService roleSessions;

    public CurrentUserController(UserRepository users, UsernameChangeService usernameChanges,
            PasswordChangeService passwordChanges, RoleSessionService roleSessions) {
        this.users = users;
        this.usernameChanges = usernameChanges;
        this.passwordChanges = passwordChanges;
        this.roleSessions = roleSessions;
    }

    @GetMapping("/me")
    @Operation(summary = "Return the authenticated user's persisted profile")
    @ApiResponse(responseCode = "200", description = "View-only persisted profile")
    @ApiResponse(responseCode = "401", description = "Missing or invalid bearer token")
    @SecurityRequirement(name = "bearerAuth")
    public Response currentUser(@AuthenticationPrincipal Jwt jwt) {
        UUID userId = UUID.fromString(jwt.getSubject());
        User user = users.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Profile not found"));
        return new Response(user.getId(), user.getEmail(), user.getUsername(), user.getRoles(),
                user.getStatus().name(), user.getCreatedAt());
    }

    @PatchMapping("/me/username")
    @Operation(summary = "Change the authenticated user's username")
    @ApiResponse(responseCode = "200", description = "Persisted profile with its updated username")
    @ApiResponse(responseCode = "400", description = "Username is blank or longer than 20 characters")
    @ApiResponse(responseCode = "409", description = "Username is already taken")
    @ApiResponse(responseCode = "401", description = "Missing or invalid bearer token")
    @SecurityRequirement(name = "bearerAuth")
    public Response changeUsername(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UsernameChange request) {
        User user = usernameChanges.changeUsername(UUID.fromString(jwt.getSubject()), request.username());
        return responseFor(user);
    }

    @PatchMapping("/me/password")
    @Operation(summary = "Change the authenticated user's password")
    @ApiResponse(responseCode = "204", description = "Password changed")
    @ApiResponse(responseCode = "400", description = "Current password is incorrect, replacement password is invalid, or replacement matches the current password")
    @ApiResponse(responseCode = "401", description = "Missing or invalid bearer token")
    @SecurityRequirement(name = "bearerAuth")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PasswordChange request) {
        passwordChanges.changePassword(UUID.fromString(jwt.getSubject()), request.currentPassword(), request.newPassword());
    }

    @PatchMapping("/me/session-role")
    @Operation(summary = "Replace the current session token with a selected Requester, Courier, or Administrator role")
    @ApiResponse(responseCode = "200", description = "Replacement Bearer token scoped to the selected role")
    @ApiResponse(responseCode = "400", description = "Missing or unsupported role")
    @ApiResponse(responseCode = "401", description = "Missing or invalid bearer token")
    @ApiResponse(responseCode = "403", description = "Account is inactive or is not assigned the selected role")
    @SecurityRequirement(name = "bearerAuth")
    public RoleSessionResponse switchSessionRole(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SessionRoleChange request) {
        RoleSessionService.RoleSession session = roleSessions.switchRole(UUID.fromString(jwt.getSubject()), request.role());
        return new RoleSessionResponse(session.token().value(), "Bearer", session.token().expiresAt(), session.user().getId(),
                session.user().getUsername(), session.effectiveRole().name(), session.user().getRoles());
    }

    private Response responseFor(User user) {
        return new Response(user.getId(), user.getEmail(), user.getUsername(), user.getRoles(),
                user.getStatus().name(), user.getCreatedAt());
    }

    public record UsernameChange(@NotBlank @Size(max = 20) String username) {
    }

    public record PasswordChange(@NotBlank String currentPassword,
            @NotBlank @Size(min = 15, max = 64) String newPassword) {
    }

    public record SessionRoleChange(@jakarta.validation.constraints.NotNull UserRole role) { }

    public record RoleSessionResponse(String accessToken, String tokenType, java.time.Instant expiresAt, UUID userId,
            String username, String role, java.util.Set<UserRole> availableRoles) { }

    public record Response(UUID userId, String email, String username, java.util.Set<UserRole> roles, String status,
            java.time.OffsetDateTime createdAt) {
    }
}
