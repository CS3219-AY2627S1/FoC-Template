package com.cs3219.foc.user.controller;

import com.cs3219.foc.user.model.dto.*;
import com.cs3219.foc.user.service.AuthCookieFactory;
import com.cs3219.foc.user.service.AuthService;
import com.cs3219.foc.user.service.EmailVerificationService;
import com.cs3219.foc.user.service.PasswordService;
import com.cs3219.foc.user.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class AuthController {
    private final UserService userService;
    private final AuthService authService;
    private final AuthCookieFactory authCookieFactory;
    private final EmailVerificationService emailVerification;
    private final PasswordService passwordService;

    @PostMapping("/auth/password-reset/request")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void requestPasswordReset(@Valid @RequestBody RequestPasswordResetRequest request) {
        passwordService.requestPasswordReset(request.email());
    }

    @PostMapping("/auth/password-reset/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        passwordService.resetPassword(request.token(), request.newPassword());
    }

    @PostMapping("/auth/email-verification/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        emailVerification.verifyEmail(request.token());
    }

    @PostMapping("/auth/email-verification/resend")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resendVerification(@Valid @RequestBody ResendVerificationRequest request) {
        emailVerification.resendRegistrationVerification(request.email());
    }

    @PostMapping("/auth/register")
    @ResponseStatus(code = HttpStatus.CREATED)
    public UserProfileDto register(@Valid @RequestBody RegisterUserRequest request) {
        return userService.registerUser(request);
    }

    @PostMapping("/auth/login")
    public ResponseEntity<AccessTokenResponse> login(@Valid @RequestBody LoginRequest request) {
        var tokens = authService.login(request);
        var cookie = authCookieFactory.createRefreshTokenCookie(tokens.refreshToken());

        var accessTokenResponse = new AccessTokenResponse(tokens.accessToken(), tokens.accessTokenExpiresAt());

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(accessTokenResponse);
    }

    @PostMapping("/auth/logout")
    public ResponseEntity<Void> logout(@CookieValue(value = "refreshToken", required = false) String refreshToken) {
        authService.logout(refreshToken);
        var cookie = authCookieFactory.clearRefreshTokenCookie();

        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .build();
    }

    @PostMapping("/auth/refresh")
    public ResponseEntity<AccessTokenResponse> refresh(
            @CookieValue(value = "refreshToken", required = false) String refreshToken) {
        var tokens = authService.refreshAccessToken(refreshToken);
        var cookie = authCookieFactory.createRefreshTokenCookie(tokens.refreshToken());

        var accessTokenResponse = new AccessTokenResponse(tokens.accessToken(), tokens.accessTokenExpiresAt());

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(accessTokenResponse);
    }
}
