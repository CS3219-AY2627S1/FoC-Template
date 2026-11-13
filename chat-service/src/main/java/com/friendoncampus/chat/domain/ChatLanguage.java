package com.friendoncampus.chat.domain;

import java.util.Arrays;

public enum ChatLanguage {
    EN("en"),
    ZH("zh"),
    MS("ms"),
    TA("ta");

    private final String code;

    ChatLanguage(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static ChatLanguage fromCode(String code) {
        return Arrays.stream(values())
                .filter(language -> language.code.equals(code))
                .findFirst()
                .orElseThrow(() -> new UnsupportedChatLanguageException(code));
    }
}
