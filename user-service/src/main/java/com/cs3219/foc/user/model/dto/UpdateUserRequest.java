package com.cs3219.foc.user.model.dto;

import com.cs3219.foc.user.model.entity.UserRole;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.Locale;

public record UpdateUserRequest(
        @NotBlank @Size(max = 255) String name,

        @NotBlank @Pattern(regexp = "\\b[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}\\b") @Size(max = 320) String email,

        @NotEmpty List<@NotNull UserRole> roles,

        @Pattern(regexp = "|\\+[1-9][0-9]{1,14}", message = "must include a country code and 2 to 15 digits") String phoneNumber,

        @Size(max = 255) String faculty) {
    public UpdateUserRequest {
        name = name == null ? null : name.strip();
        email = email == null ? null : email.strip().toLowerCase(Locale.ROOT);
        phoneNumber = phoneNumber == null
                ? null
                : phoneNumber.strip().replace(" ", "").replace("-", "");
        faculty = faculty == null ? null : faculty.strip();
    }
}
