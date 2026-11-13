package com.friendoncampus.user.service;
public class InvalidEmailVerificationCodeException extends RuntimeException { public InvalidEmailVerificationCodeException() { super("Invalid or expired email verification code"); } }
