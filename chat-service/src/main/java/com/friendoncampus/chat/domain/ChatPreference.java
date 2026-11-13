package com.friendoncampus.chat.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "chat_preferences")
public class ChatPreference {

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "preferred_language", nullable = false, length = 2)
    private ChatLanguage preferredLanguage;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected ChatPreference() {
    }

    public ChatPreference(UUID userId, ChatLanguage preferredLanguage, OffsetDateTime createdAt) {
        this.userId = userId;
        this.preferredLanguage = preferredLanguage;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
    }

    public void changeLanguage(ChatLanguage language, OffsetDateTime changedAt) {
        preferredLanguage = language;
        updatedAt = changedAt;
    }

    public UUID getUserId() {
        return userId;
    }

    public ChatLanguage getPreferredLanguage() {
        return preferredLanguage;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
