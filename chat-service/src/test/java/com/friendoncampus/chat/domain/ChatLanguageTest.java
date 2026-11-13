package com.friendoncampus.chat.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class ChatLanguageTest {

    @Test
    void acceptsOnlyThePublishedLowercaseCodes() {
        assertThat(ChatLanguage.fromCode("en")).isEqualTo(ChatLanguage.EN);
        assertThat(ChatLanguage.fromCode("zh")).isEqualTo(ChatLanguage.ZH);
        assertThatThrownBy(() -> ChatLanguage.fromCode("EN"))
                .isInstanceOf(UnsupportedChatLanguageException.class);
        assertThatThrownBy(() -> ChatLanguage.fromCode(" en "))
                .isInstanceOf(UnsupportedChatLanguageException.class);
        assertThatThrownBy(() -> ChatLanguage.fromCode(null))
                .isInstanceOf(UnsupportedChatLanguageException.class);
    }
}
