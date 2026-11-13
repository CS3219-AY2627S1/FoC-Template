package com.friendoncampus.chat.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.chat.domain.ChatLanguage;
import com.friendoncampus.chat.domain.ChatPreference;
import com.friendoncampus.chat.repository.ChatPreferenceRepository;

@Service
public class ChatPreferenceService {

    private final ChatPreferenceRepository preferences;
    private final Clock clock;

    public ChatPreferenceService(ChatPreferenceRepository preferences, Clock clock) {
        this.preferences = preferences;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ChatLanguage get(UUID userId) {
        return preferences.findById(userId)
                .map(ChatPreference::getPreferredLanguage)
                .orElse(ChatLanguage.EN);
    }

    @Transactional
    public ChatLanguage put(UUID userId, String languageCode) {
        ChatLanguage language = ChatLanguage.fromCode(languageCode);
        OffsetDateTime now = OffsetDateTime.now(clock);
        preferences.insertDefaultIfAbsent(userId, now);
        ChatPreference preference = preferences.findByUserIdForUpdate(userId)
                .orElseThrow(() -> new IllegalStateException("Chat preference could not be initialized"));
        preference.changeLanguage(language, now);
        preferences.save(preference);
        return language;
    }
}
