package com.campuscouriers.credit.exception;



public class WalletSuspendedException extends RuntimeException {
    public WalletSuspendedException() {
        super("Wallet is suspended");
    }
}
