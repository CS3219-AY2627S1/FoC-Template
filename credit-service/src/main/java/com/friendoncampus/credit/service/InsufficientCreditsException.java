package com.friendoncampus.credit.service;

public class InsufficientCreditsException extends CreditRequestRejectedException {
    public InsufficientCreditsException() {
        super("Available credit balance is insufficient");
    }
}
