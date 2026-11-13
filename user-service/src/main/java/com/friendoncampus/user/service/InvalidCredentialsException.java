package com.friendoncampus.user.service;

public class InvalidCredentialsException extends RuntimeException {
    public InvalidCredentialsException() {
        super("Incorrect email or password");
    }
}
