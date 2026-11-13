package com.cs3219.foc.user.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateUserProfileRequest(
        @NotBlank @Size(max = 255) String name,

        @Pattern(regexp = "\\+[1-9][0-9]{1,14}", message = "must include a country code and 2 to 15 digits") String phoneNumber,

        @Size(max = 255) String faculty) {
    public UpdateUserProfileRequest {
        name = name == null ? null : name.strip();
        phoneNumber = optionalText(phoneNumber);
        if (phoneNumber != null) {
            phoneNumber = phoneNumber.replace(" ", "").replace("-", "");
        }
        faculty = optionalText(faculty);
    }

    private static String optionalText(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
