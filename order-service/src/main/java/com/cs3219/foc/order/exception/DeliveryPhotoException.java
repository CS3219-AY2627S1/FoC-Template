package com.cs3219.foc.order.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

// The uploaded photo cant be used / photo store failed
@Getter
public class DeliveryPhotoException extends RuntimeException {
    private final HttpStatus status;

    public DeliveryPhotoException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public DeliveryPhotoException(HttpStatus status, String message, Throwable cause) {
        super(message, cause);
        this.status = status;
    }
}
