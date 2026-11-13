package com.friendoncampus.chat.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.friendoncampus.chat.domain.ChatLanguage;
import com.friendoncampus.chat.domain.QuickReplyKey;
import com.friendoncampus.chat.domain.UnsupportedChatLanguageException;
import com.friendoncampus.chat.config.SecurityConfiguration;
import com.friendoncampus.chat.service.ChatPreferenceService;
import com.friendoncampus.chat.service.QuickReplyCatalog;
import com.friendoncampus.chat.web.error.ApiExceptionHandler;
import com.friendoncampus.chat.web.error.ProblemSecurityHandler;

@WebMvcTest(ChatPreferenceController.class)
@Import({SecurityConfiguration.class, ProblemSecurityHandler.class, ApiExceptionHandler.class})
class ChatPreferenceControllerTest {
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    com.friendoncampus.chat.authorization.CurrentAuthorization currentAuthorization;

    private static final UUID USER_ID = UUID.fromString("722d6da3-93f0-4a7d-9820-ab05047a9253");

    @Autowired
    MockMvc mvc;

    @MockitoBean
    ChatPreferenceService preferences;

    @MockitoBean
    QuickReplyCatalog quickReplies;

    @MockitoBean
    JwtDecoder jwtDecoder;

    @Test
    void allChatPreferenceEndpointsRequireAuthentication() throws Exception {
        mvc.perform(get("/api/chat/preferences")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/chat/quick-replies")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/chat/preferences").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"preferredLanguage\":\"zh\"}"))
                .andExpect(status().isUnauthorized());
        verify(preferences, never()).get(any());
    }

    @Test
    void readsAndUpdatesOnlyTheAuthenticatedUsersPreference() throws Exception {
        when(preferences.get(USER_ID)).thenReturn(ChatLanguage.EN);
        when(preferences.put(USER_ID, "zh")).thenReturn(ChatLanguage.ZH);

        mvc.perform(get("/api/chat/preferences").with(actor("REQUESTER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.preferredLanguage").value("en"));
        mvc.perform(put("/api/chat/preferences").with(actor("COURIER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"preferredLanguage\":\"zh\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.preferredLanguage").value("zh"));

        verify(preferences).get(USER_ID);
        verify(preferences).put(USER_ID, "zh");
    }

    @Test
    void returnsLocalizedServerOwnedQuickReplies() throws Exception {
        when(preferences.get(USER_ID)).thenReturn(ChatLanguage.MS);
        when(quickReplies.list(ChatLanguage.MS)).thenReturn(List.of(
                new QuickReplyCatalog.QuickReply(QuickReplyKey.ARRIVED, ChatLanguage.MS,
                        "Saya sudah sampai.")));

        mvc.perform(get("/api/chat/quick-replies").with(actor("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].key").value("ARRIVED"))
                .andExpect(jsonPath("$.content[0].language").value("ms"))
                .andExpect(jsonPath("$.content[0].text").value("Saya sudah sampai."));
    }

    @Test
    void reportsUnsupportedLanguagesAsProblemDetails() throws Exception {
        when(preferences.put(USER_ID, "xx")).thenThrow(new UnsupportedChatLanguageException("xx"));

        mvc.perform(put("/api/chat/preferences").with(actor("REQUESTER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"preferredLanguage\":\"xx\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_LANGUAGE"));
    }

    private static org.springframework.test.web.servlet.request.RequestPostProcessor actor(String role) {
        return jwt().jwt(jwt -> jwt.subject(USER_ID.toString()).claim("role", role));
    }
}
