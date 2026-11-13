package com.cs3219.foc.user.model.dto;

import com.cs3219.foc.user.validation.Utf8ByteLength;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
        @NotBlank @Utf8ByteLength(max = 72) String currentPassword,
        @NotBlank @Size(min = 8) @Utf8ByteLength(max = 72) String newPassword) {
    @Override
    public String toString() {
        return "ChangePasswordRequest[REDACTED]";
    }
}
