package com.friendoncampus.credit.service;

public class InvalidReservationStateException extends CreditRequestRejectedException {
    public InvalidReservationStateException(String detail) {
        super(detail);
    }
}
