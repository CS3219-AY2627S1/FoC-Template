package com.cs3219.foc.user.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import java.nio.charset.StandardCharsets;

public class Utf8ByteLengthValidator implements ConstraintValidator<Utf8ByteLength, String> {
    private int max;

    @Override
    public void initialize(Utf8ByteLength constraint) {
        max = constraint.max();
    }

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        // Required values are handled separately by @NotBlank.
        return value == null || value.getBytes(StandardCharsets.UTF_8).length <= max;
    }
}
