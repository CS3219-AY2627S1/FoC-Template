package com.cs3219.foc.user.model.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Locale;

public record ResendVerificationRequest(
        @NotBlank @Email @Size(max = 320) String email) {
    public ResendVerificationRequest {
        email = email == null ? null : email.strip().toLowerCase(Locale.ROOT);
    }
}
