package com.cs3219.foc.user.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Locale;

public record RegisterUserRequest(
        @NotBlank @Pattern(regexp = "\\b[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}\\b") String email,

        @NotBlank String name,
        @NotBlank @Size(min = 8) String password) {
    public RegisterUserRequest {
        if (email != null) {
            email = email.strip().toLowerCase(Locale.ROOT);
        }

        if (name != null) {
            name = name.strip();
        }
    }
}
