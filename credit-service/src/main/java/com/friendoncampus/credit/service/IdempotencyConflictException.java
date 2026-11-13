package com.friendoncampus.credit.service;

public class IdempotencyConflictException extends CreditRequestRejectedException {
    public IdempotencyConflictException() {
        super("Operation ID was already used with different request data");
    }
}
