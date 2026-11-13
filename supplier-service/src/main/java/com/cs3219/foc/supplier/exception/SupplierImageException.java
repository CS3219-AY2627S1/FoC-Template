package com.cs3219.foc.supplier.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

// image upload errs
@Getter
public class SupplierImageException extends RuntimeException {
    private final HttpStatus status;

    public SupplierImageException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public SupplierImageException(HttpStatus status, String message, Throwable cause) {
        super(message, cause);
        this.status = status;
    }
}
