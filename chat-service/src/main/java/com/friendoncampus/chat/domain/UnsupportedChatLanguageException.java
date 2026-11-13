package com.friendoncampus.chat.domain;

public class UnsupportedChatLanguageException extends RuntimeException {

    public UnsupportedChatLanguageException(String language) {
        super("preferredLanguage must be one of: en, zh, ms, ta");
    }
}
