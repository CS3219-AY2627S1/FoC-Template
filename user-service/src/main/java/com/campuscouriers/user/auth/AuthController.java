/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.auth;

import com.campuscouriers.user.auth.dto.LoginRequest;
import com.campuscouriers.user.auth.dto.LoginResponse;
import com.campuscouriers.user.exception.EmailAlreadyRegisteredException;
import com.campuscouriers.user.exception.InvalidCredentialsException;
import com.campuscouriers.user.exception.InvalidRefreshTokenException;
import com.campuscouriers.user.security.access.AccessTokenClaims;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.convert.DurationStyle;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import com.campuscouriers.user.auth.dto.RegisterRequest;

import jakarta.validation.Valid;

import java.time.Duration;

@RestController 
@RequestMapping("/auth")
public class AuthController {

    static final String REFRESH_TOKEN_COOKIE = "refreshToken";

    private final AuthService authService;
    private final Duration refreshTokenTtl;

    public AuthController(AuthService authService, @Value("${app.jwt.refresh-token-ttl}") String refreshTokenTtl) {
        this.authService = authService;
        this.refreshTokenTtl = DurationStyle.detectAndParse(refreshTokenTtl);
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public void register(@Valid @RequestBody RegisterRequest request) {
        authService.register(request);
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return withRefreshTokenCookie(authService.login(request));
    }

    @PostMapping("/refresh")
    public ResponseEntity<LoginResponse> refresh(
            @CookieValue(name = REFRESH_TOKEN_COOKIE, required = false) String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new InvalidRefreshTokenException();   // 401 rather than a 400 for the missing cookie
        }
        return withRefreshTokenCookie(authService.refresh(refreshToken));
    }

    // Logs out the current device only; the frontend handles the redirect to the login page
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @AuthenticationPrincipal AccessTokenClaims claims,
            @CookieValue(name = REFRESH_TOKEN_COOKIE, required = false) String refreshToken) {
        if (refreshToken != null && !refreshToken.isBlank()) {
            authService.logout(claims.accountId(), refreshToken);
        }
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, refreshTokenCookie("", Duration.ZERO).toString())
                .build();
    }

    // Access token goes in the body; refresh token only goes in the HttpOnly cookie
    private ResponseEntity<LoginResponse> withRefreshTokenCookie(AuthTokens tokens) {
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, refreshTokenCookie(tokens.refreshToken(), refreshTokenTtl).toString())
                .body(new LoginResponse(tokens.accessToken(), tokens.expiresIn()));
    }

    // Domain is omitted so the cookie is host-only; a zero max age tells the browser to delete it
    private static ResponseCookie refreshTokenCookie(String value, Duration maxAge) {
        return ResponseCookie.from(REFRESH_TOKEN_COOKIE, value)
                .httpOnly(true)
                .secure(true)
                .sameSite("Strict")
                .path("/auth")
                .maxAge(maxAge)
                .build();
    }

    // For when the duplicate email check returns false at the service level
    @ExceptionHandler(EmailAlreadyRegisteredException.class)
    public ProblemDetail handleDuplicateEmail(EmailAlreadyRegisteredException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
    }

    // For when 2 concurrent requests pass the email duplicate check but fails DB unique constraint
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ProblemDetail handleUniqueConstraintRejection(DataIntegrityViolationException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
                "The request could not be completed due to a conflict." // kept generic to prevent data leak
        );
    }

    // For when either the email or password is invalid for a login request
    @ExceptionHandler(InvalidCredentialsException.class)
    public ProblemDetail handleInvalidCredentials(InvalidCredentialsException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, ex.getMessage());
    }

    // For when the old-token is invalid for a token refresh request
    @ExceptionHandler(InvalidRefreshTokenException.class)
    public ProblemDetail handleInvalidRefreshToken(InvalidRefreshTokenException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, ex.getMessage());
    }
    
}