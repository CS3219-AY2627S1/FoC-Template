package com.friendoncampus.chat.web;

import java.util.List;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.chat.domain.ChatLanguage;
import com.friendoncampus.chat.service.ChatPreferenceService;
import com.friendoncampus.chat.service.QuickReplyCatalog;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

@RestController
@RequestMapping(path = "/api/chat", produces = MediaType.APPLICATION_JSON_VALUE)
public class ChatPreferenceController {

    private final ChatPreferenceService preferences;
    private final QuickReplyCatalog quickReplies;

    public ChatPreferenceController(ChatPreferenceService preferences, QuickReplyCatalog quickReplies) {
        this.preferences = preferences;
        this.quickReplies = quickReplies;
    }

    @GetMapping("/preferences")
    public ChatPreferencesResponse getPreferences(@AuthenticationPrincipal Jwt jwt) {
        return ChatPreferencesResponse.from(preferences.get(actor(jwt)));
    }

    @PutMapping(path = "/preferences", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ChatPreferencesResponse putPreferences(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody UpdateChatPreferencesRequest request) {
        return ChatPreferencesResponse.from(preferences.put(actor(jwt), request.preferredLanguage()));
    }

    @GetMapping("/quick-replies")
    public QuickReplyListResponse getQuickReplies(@AuthenticationPrincipal Jwt jwt) {
        ChatLanguage language = preferences.get(actor(jwt));
        List<QuickReplyResponse> content = quickReplies.list(language).stream()
                .map(reply -> new QuickReplyResponse(reply.key().name(), reply.language().code(), reply.text()))
                .toList();
        return new QuickReplyListResponse(content);
    }

    private static UUID actor(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }

    public record UpdateChatPreferencesRequest(@NotBlank String preferredLanguage) {
    }

    public record ChatPreferencesResponse(String preferredLanguage) {
        static ChatPreferencesResponse from(ChatLanguage language) {
            return new ChatPreferencesResponse(language.code());
        }
    }

    public record QuickReplyResponse(String key, String language, String text) {
    }

    public record QuickReplyListResponse(List<QuickReplyResponse> content) {
    }
}
