package com.friendoncampus.supplier.service;

public class InvalidSupplierQueryException extends RuntimeException {

    public InvalidSupplierQueryException(String message) {
        super(message);
    }
}
