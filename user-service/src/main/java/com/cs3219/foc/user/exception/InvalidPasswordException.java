package com.cs3219.foc.user.exception;

import lombok.Getter;

@Getter
public class InvalidPasswordException extends RuntimeException {
    private final String field;

    public InvalidPasswordException(String field, String message) {
        super(message);
        this.field = field;
    }
}
