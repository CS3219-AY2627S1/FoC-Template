package com.friendoncampus.notification.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.friendoncampus.notification.domain.Notification;
import com.friendoncampus.notification.domain.NotificationType;
import com.friendoncampus.notification.service.NotificationPaging;
import com.friendoncampus.notification.service.NotificationNotFoundException;
import com.friendoncampus.notification.service.NotificationQueryService;
import com.friendoncampus.notification.service.NotificationQueryService.PushBatch;
import com.friendoncampus.notification.service.NotificationReadStateService;
import com.friendoncampus.notification.web.error.ApiExceptionHandler;

/**
 * {@code /api/notifications/me}: paging defaults and limits, response shape, messages, read marking,
 * the unread count, and that the recipient is always the token subject.
 */
class NotificationControllerTest {

    private static final UUID CALLER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID ORDER_ID = UUID.fromString("3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64");

    private NotificationQueryService queryService;
    private NotificationReadStateService readStateService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        queryService = mock(NotificationQueryService.class);
        readStateService = mock(NotificationReadStateService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new NotificationController(queryService, readStateService))
                .setControllerAdvice(new ApiExceptionHandler())
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject(CALLER.toString())
                .claim("role", "COURIER")
                .build();
        SecurityContextHolder.getContext().setAuthentication(
                new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_COURIER"))));
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    private static final OffsetDateTime OCCURRED_AT = OffsetDateTime.of(2026, 10, 30, 9, 15, 0, 0, ZoneOffset.UTC);

    private static Notification notification(NotificationType type, UUID orderId, String params) {
        return new Notification(UUID.randomUUID(), CALLER, type, orderId, params, UUID.randomUUID(),
                UUID.randomUUID().toString(), OCCURRED_AT, OCCURRED_AT.plusSeconds(1));
    }

    private void returns(Notification notification) {
        when(queryService.listFor(eq(CALLER), any()))
                .thenReturn(new PageImpl<>(List.of(notification), PageRequest.of(0, 20), 1));
    }

    @Test
    void listsTheCallersNotificationsWithDefaultPaging() throws Exception {
        Notification notification = notification(NotificationType.CREDITS_RECEIVED, ORDER_ID, "{\"amount\":3}");
        returns(notification);

        mockMvc.perform(get("/api/notifications/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(notification.getId().toString()))
                .andExpect(jsonPath("$.content[0].type").value("CREDITS_RECEIVED"))
                .andExpect(jsonPath("$.content[0].orderId").value(ORDER_ID.toString()))
                .andExpect(jsonPath("$.content[0].message").value("You received 3 credits for completing an errand."))
                .andExpect(jsonPath("$.content[0].occurredAt").exists())
                .andExpect(jsonPath("$.content[0].readAt").value(nullValue()))
                .andExpect(jsonPath("$.content[0].params").doesNotExist())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.totalPages").value(1));

        ArgumentCaptor<NotificationPaging> paging = ArgumentCaptor.forClass(NotificationPaging.class);
        verify(queryService).listFor(eq(CALLER), paging.capture());
        assertThat(paging.getValue()).isEqualTo(new NotificationPaging(0, 20));
    }

    @Test
    void anAccountLevelNotificationHasANullOrderId() throws Exception {
        returns(notification(NotificationType.CREDITS_WELCOME, null, "{\"amount\":10}"));

        mockMvc.perform(get("/api/notifications/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].type").value("CREDITS_WELCOME"))
                .andExpect(jsonPath("$.content[0].orderId").value(nullValue()));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "CREDITS_WELCOME     | 10 | Welcome! You received 10 credits to get started.",
            "CREDITS_RECEIVED    | 1  | You received 1 credit for completing an errand.",
            "CREDITS_COMPENSATED | 2  | You received 2 credits as compensation for a cancelled errand."
    })
    void eachTypeHasItsMessage(NotificationType type, int amount, String message) throws Exception {
        returns(notification(type, ORDER_ID, "{\"amount\":" + amount + "}"));

        mockMvc.perform(get("/api/notifications/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].message").value(message));
    }

    @Test
    void passesAValidPageAndSize() throws Exception {
        when(queryService.listFor(eq(CALLER), any())).thenReturn(new PageImpl<>(List.of(), PageRequest.of(2, 100), 0));

        mockMvc.perform(get("/api/notifications/me").param("page", "2").param("size", "100"))
                .andExpect(status().isOk());

        verify(queryService).listFor(CALLER, new NotificationPaging(2, 100));
    }

    @Test
    void aUserIdParameterIsIgnoredAndTheTokenSubjectIsUsed() throws Exception {
        when(queryService.listFor(eq(CALLER), any())).thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        mockMvc.perform(get("/api/notifications/me").param("userId", UUID.randomUUID().toString()))
                .andExpect(status().isOk());

        verify(queryService).listFor(eq(CALLER), any());
    }

    @ParameterizedTest
    @CsvSource({
            "page, -1",
            "page, abc",
            "page, ''",
            "size, 0",
            "size, 101",
            "size, 1.5"
    })
    void rejectsAnInvalidPagingValue(String parameter, String value) throws Exception {
        mockMvc.perform(get("/api/notifications/me").param(parameter, value))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("INVALID_QUERY"));

        verifyNoInteractions(queryService);
    }

    @Test
    void markingReadReturnsTheNotificationWithReadAt() throws Exception {
        Notification notification = mock(Notification.class);
        UUID id = UUID.randomUUID();
        when(notification.getId()).thenReturn(id);
        when(notification.getType()).thenReturn(NotificationType.CREDITS_RECEIVED);
        when(notification.getOrderId()).thenReturn(ORDER_ID);
        when(notification.getParams()).thenReturn("{\"amount\":3}");
        when(notification.getOccurredAt()).thenReturn(OCCURRED_AT);
        when(notification.getReadAt()).thenReturn(OCCURRED_AT.plusMinutes(5));
        when(readStateService.markRead(CALLER, id)).thenReturn(notification);

        mockMvc.perform(patch("/api/notifications/me/{id}/read", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.message").value("You received 3 credits for completing an errand."))
                .andExpect(jsonPath("$.readAt").value("2026-10-30T09:20:00Z"));

        verify(readStateService).markRead(CALLER, id);
    }

    @Test
    void markingSomeoneElsesOrAMissingNotificationIsNotFound() throws Exception {
        UUID id = UUID.randomUUID();
        when(readStateService.markRead(CALLER, id)).thenThrow(new NotificationNotFoundException(id));

        mockMvc.perform(patch("/api/notifications/me/{id}/read", id))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("NOTIFICATION_NOT_FOUND"));
    }

    @Test
    void aMalformedIdIsRejectedBeforeAnyLookup() throws Exception {
        mockMvc.perform(patch("/api/notifications/me/{id}/read", "not-a-uuid"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("INVALID_ID"));

        verifyNoInteractions(readStateService);
    }

    @Test
    void theUnreadCountIsTheCallers() throws Exception {
        when(queryService.countUnread(CALLER)).thenReturn(3L);

        mockMvc.perform(get("/api/notifications/me/unread-count").param("userId", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unreadCount").value(3));

        verify(queryService).countUnread(CALLER);
    }

    @Test
    void pollsPushNotificationsUsingTheServerCursorAndTokenSubject() throws Exception {
        OffsetDateTime after = OCCURRED_AT.minusSeconds(1);
        OffsetDateTime cursor = OCCURRED_AT.plusSeconds(2);
        Notification chat = notification(NotificationType.CHAT_MESSAGE_RECEIVED, ORDER_ID, "{}");
        when(queryService.pushFor(CALLER, after)).thenReturn(new PushBatch(List.of(chat), cursor));

        mockMvc.perform(get("/api/notifications/me/push").param("after", after.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].type").value("CHAT_MESSAGE_RECEIVED"))
                .andExpect(jsonPath("$.items[0].message")
                        .value("New message in chat"))
                .andExpect(jsonPath("$.cursor").value(cursor.toString()));

        verify(queryService).pushFor(CALLER, after);
    }
}
