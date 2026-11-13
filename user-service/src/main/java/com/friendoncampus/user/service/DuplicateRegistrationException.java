package com.friendoncampus.user.service;
public class DuplicateRegistrationException extends RuntimeException { public DuplicateRegistrationException(String field) { super(field + " is already taken"); } }
