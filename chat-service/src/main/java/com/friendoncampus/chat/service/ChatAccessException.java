package com.friendoncampus.chat.service;

public class ChatAccessException extends RuntimeException {
    public ChatAccessException() { super("Conversation not found"); }
}
