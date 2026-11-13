package com.cs3219.foc.credit.exception;

public class ReservationConflictException extends RuntimeException {
    public ReservationConflictException() {
        super("Reservation identity cannot be reused with changed data");
    }
}
