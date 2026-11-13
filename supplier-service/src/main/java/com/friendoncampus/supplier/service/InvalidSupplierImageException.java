package com.friendoncampus.supplier.service;

public class InvalidSupplierImageException extends RuntimeException {

    public InvalidSupplierImageException(String message) {
        super(message);
    }

    public InvalidSupplierImageException(String message, Throwable cause) {
        super(message, cause);
    }
}
