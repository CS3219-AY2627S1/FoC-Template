package com.friendoncampus.chat.translation;

public interface TranslationProvider {
    String name();
    String model();
    String translate(String text, String sourceLanguage, String targetLanguage);
}
