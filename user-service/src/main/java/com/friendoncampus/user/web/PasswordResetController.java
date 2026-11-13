package com.friendoncampus.user.web;

import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.user.service.PasswordResetService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/users")
public class PasswordResetController {
    private static final String ELIGIBLE_NUS_EMAIL = "^[^@\\s]+@(u\\.nus\\.edu|u\\.duke\\.nus\\.edu|u\\.yale-nus\\.edu\\.sg)$";

    private final PasswordResetService passwordResets;

    public PasswordResetController(PasswordResetService passwordResets) {
        this.passwordResets = passwordResets;
    }

    @PostMapping("/password-reset-requests")
    @Operation(summary = "Request a password reset code")
    @ApiResponse(responseCode = "202", description = "Same response and Retry-After cooldown for known and unknown email addresses")
    @ApiResponse(responseCode = "400", description = "Email is not an eligible NUS student email address")
    public ResponseEntity<Void> request(@Valid @RequestBody PasswordResetRequest request) {
        PasswordResetService.PasswordResetRequestResult result = passwordResets.request(request.email());
        return ResponseEntity.accepted().header(HttpHeaders.RETRY_AFTER, Long.toString(result.retryAfterSeconds())).build();
    }

    @PostMapping("/password-reset-confirmations")
    @Operation(summary = "Confirm a password reset code and change the password")
    @ApiResponse(responseCode = "204", description = "Password changed; reset code consumed")
    @ApiResponse(responseCode = "400", description = "Invalid, expired, replayed, or exhausted code; invalid password; or replacement matching the current password")
    public ResponseEntity<Void> confirm(@Valid @RequestBody PasswordResetConfirmation confirmation) {
        passwordResets.confirm(confirmation.email(), confirmation.code(), confirmation.password());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/password-reset-verifications")
    @Operation(summary = "Validate a password reset code before choosing a new password")
    public ResponseEntity<Void> verify(@Valid @RequestBody PasswordResetVerification verification) {
        passwordResets.verify(verification.email(), verification.code());
        return ResponseEntity.noContent().build();
    }

    public record PasswordResetRequest(@NotBlank @Email
            @Pattern(regexp = ELIGIBLE_NUS_EMAIL, flags = Pattern.Flag.CASE_INSENSITIVE,
                    message = "email must use an eligible NUS student domain") String email) {
    }

    public record PasswordResetConfirmation(@NotBlank @Email
            @Pattern(regexp = ELIGIBLE_NUS_EMAIL, flags = Pattern.Flag.CASE_INSENSITIVE,
                    message = "email must use an eligible NUS student domain") String email,
            @NotBlank @Pattern(regexp = "\\d{6}") String code,
            @NotBlank @Size(min = 15, max = 64) String password) {
    }

    public record PasswordResetVerification(@NotBlank @Email
            @Pattern(regexp = ELIGIBLE_NUS_EMAIL, flags = Pattern.Flag.CASE_INSENSITIVE,
                    message = "email must use an eligible NUS student domain") String email,
            @NotBlank @Pattern(regexp = "\\d{6}") String code) {
    }
}
