package com.friendoncampus.user.web;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.friendoncampus.user.service.EmailVerificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

@RestController @RequestMapping("/api/users")
public class EmailVerificationController {
    private final EmailVerificationService verifications;
    public EmailVerificationController(EmailVerificationService verifications) { this.verifications = verifications; }
    @PostMapping("/email-verifications") @Operation(summary = "Verify a registered NUS email address")
    @ApiResponse(responseCode = "204", description = "Email verified; account is now active")
    @ApiResponse(responseCode = "400", description = "Invalid or expired six-digit code")
    public ResponseEntity<Void> verify(@Valid @RequestBody Verification request) { verifications.verify(request.email(), request.code()); return ResponseEntity.noContent().build(); }
    @PostMapping("/email-verification-resends") @Operation(summary = "Resend an email verification code after the cooldown")
    @ApiResponse(responseCode = "202", description = "New code sent; all earlier codes are invalid")
    @ApiResponse(responseCode = "403", description = "Banned account")
    @ApiResponse(responseCode = "404", description = "No registered account for this email")
    @ApiResponse(responseCode = "409", description = "Account already verified")
    @ApiResponse(responseCode = "429", description = "90-second cooldown; see Retry-After header")
    @ApiResponse(responseCode = "503", description = "Verification email delivery unavailable")
    public ResponseEntity<Void> resend(@Valid @RequestBody Resend request) { verifications.resend(request.email()); return ResponseEntity.accepted().build(); }
    public record Verification(@NotBlank @Email String email, @NotBlank @Pattern(regexp = "\\d{6}") String code) { }
    public record Resend(@NotBlank @Email String email) { }
}
