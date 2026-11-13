package com.cs3219.foc.user.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class AvatarException extends RuntimeException {
    private final HttpStatus status;

    public AvatarException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public AvatarException(HttpStatus status, String message, Throwable cause) {
        super(message, cause);
        this.status = status;
    }
}
