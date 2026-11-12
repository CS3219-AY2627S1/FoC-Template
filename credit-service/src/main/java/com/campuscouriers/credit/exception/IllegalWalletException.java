package com.campuscouriers.credit.exception;

public class IllegalWalletException extends RuntimeException {

    public IllegalWalletException() {
        super("Courier wallet must be different from the requester wallet");
    }
}
