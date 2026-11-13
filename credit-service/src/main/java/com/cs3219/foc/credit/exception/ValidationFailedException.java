package com.cs3219.foc.credit.exception;

import lombok.Getter;
import org.springframework.validation.Errors;

@Getter
public class ValidationFailedException extends RuntimeException {
    private final Errors validationErrors;

    public ValidationFailedException(String message, Errors validationErrors) {
        super(message);
        this.validationErrors = validationErrors;
    }
}
