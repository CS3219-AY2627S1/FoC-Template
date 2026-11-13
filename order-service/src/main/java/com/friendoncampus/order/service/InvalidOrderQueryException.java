package com.friendoncampus.order.service;

/** A list query parameter (paging, sort or filter) is malformed or out of range. */
public class InvalidOrderQueryException extends RuntimeException {

    public InvalidOrderQueryException(String message) {
        super(message);
    }
}
