package com.cs3219.foc.user.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class EmailVerificationException extends RuntimeException {
    private final HttpStatus status;

    public EmailVerificationException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }
}
