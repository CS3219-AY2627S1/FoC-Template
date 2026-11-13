package com.friendoncampus.chat.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.friendoncampus.chat.domain.ChatLanguage;
import com.friendoncampus.chat.domain.QuickReplyKey;

class QuickReplyCatalogTest {

    private final QuickReplyCatalog catalog = new QuickReplyCatalog();

    @Test
    void everySupportedLanguageHasEveryStableReplyKey() {
        for (ChatLanguage language : ChatLanguage.values()) {
            assertThat(catalog.list(language))
                    .extracting(QuickReplyCatalog.QuickReply::key)
                    .containsExactly(QuickReplyKey.values());
            assertThat(catalog.list(language))
                    .allSatisfy(reply -> {
                        assertThat(reply.language()).isEqualTo(language);
                        assertThat(reply.text()).isNotBlank();
                    });
        }
    }

    @Test
    void resolvesLocalizedTextWithoutAllowingTheClientToSupplyIt() {
        assertThat(catalog.resolve(ChatLanguage.EN, QuickReplyKey.ARRIVED)).isEqualTo("I've arrived.");
        assertThat(catalog.resolve(ChatLanguage.ZH, QuickReplyKey.ARRIVED)).isEqualTo("我到了。");
    }
}
