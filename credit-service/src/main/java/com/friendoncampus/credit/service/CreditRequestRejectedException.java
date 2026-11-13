package com.friendoncampus.credit.service;

public abstract class CreditRequestRejectedException extends RuntimeException {

    protected CreditRequestRejectedException(String message) {
        super(message);
    }
}
