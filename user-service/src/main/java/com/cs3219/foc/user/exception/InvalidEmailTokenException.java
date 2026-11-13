package com.cs3219.foc.user.exception;

public class InvalidEmailTokenException extends RuntimeException {
    public InvalidEmailTokenException() {
        super("This verification link is no longer valid.");
    }
}
