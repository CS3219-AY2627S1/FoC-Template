package com.friendoncampus.chat.translation;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="app.rabbit.enabled",havingValue="false")
@ConditionalOnProperty(name="app.translation.provider",havingValue="gemini")
public class InlineTranslationWorker {
    private final ChatTranslationService translations;
    public InlineTranslationWorker(ChatTranslationService translations){this.translations=translations;}
    @Scheduled(fixedDelayString="${app.translation.dispatch-delay-ms:1500}")
    public void process(){translations.claimPending(20).forEach(translations::process);}
}
