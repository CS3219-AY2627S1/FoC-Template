package com.cs3219.foc.user.model.dto;

import jakarta.validation.constraints.NotBlank;

public record VerifyEmailRequest(@NotBlank String token) {
    @Override
    public String toString() {
        return "VerifyEmailRequest[REDACTED]";
    }
}
