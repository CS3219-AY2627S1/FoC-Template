package com.friendoncampus.user.web;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.user.service.LoginService;
import com.friendoncampus.user.domain.UserRole;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;

@RestController
@RequestMapping("/api/users")
public class LoginController {
    private final LoginService loginService;

    public LoginController(LoginService loginService) {
        this.loginService = loginService;
    }

    @PostMapping("/login")
    @Operation(summary = "Log in and receive a 15-minute RS256 access token")
    @ApiResponse(responseCode = "200", description = "Bearer JWT, expiry, stable user ID, username, and role")
    @ApiResponse(responseCode = "401", description = "Generic incorrect email or password for unknown emails, bad passwords, temporary lockouts, and banned accounts")
    @ApiResponse(responseCode = "403", description = "Email verification required; returned only after a correct password for an unverified account")
    public ResponseEntity<Response> login(@RequestBody Request request) {
        LoginService.LoginResult login = loginService.login(request.email(), request.password());
        return ResponseEntity.ok(new Response(login));
    }

    public record Request(String email, String password) {
    }

    public record Response(String accessToken, String tokenType, Instant expiresAt, UUID userId, String username,
            String role, Set<UserRole> availableRoles) {
        Response(LoginService.LoginResult login) {
            this(login.token().value(), "Bearer", login.token().expiresAt(), login.user().getId(),
                    login.user().getUsername(), login.effectiveRole().name(), login.user().getRoles());
        }
    }
}
