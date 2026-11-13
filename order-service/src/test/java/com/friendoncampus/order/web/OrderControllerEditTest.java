package com.friendoncampus.order.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderDetails;
import com.friendoncampus.order.domain.OrderErrorCode;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.domain.OrderTransitionException;
import com.friendoncampus.order.domain.OrderVersionConflictException;
import com.friendoncampus.order.service.OrderExpiredOnActionException;
import com.friendoncampus.order.service.OrderNotFoundException;
import com.friendoncampus.order.service.OrderService;
import com.friendoncampus.order.web.error.ApiExceptionHandler;

/** {@code PATCH /api/orders/{id}}: body validation, the edited response and problem+json codes. */
class OrderControllerEditTest {

    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID ORDER_ID = UUID.fromString("3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64");
    private static final String PICKUP = "9fd58f13-c8d5-4320-b757-7893d69a4ae0";
    private static final String DROPOFF = "eb46dc78-e25e-4f07-a7a2-26bff615d170";

    private OrderService orderService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        orderService = mock(OrderService.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new OrderController(orderService))
                .setControllerAdvice(new ApiExceptionHandler())
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();
        Jwt jwt = Jwt.withTokenValue("test-token")
                .header("alg", "RS256")
                .subject(REQUESTER.toString())
                .claim("role", "REQUESTER")
                .build();
        SecurityContextHolder.getContext().setAuthentication(
                new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_REQUESTER"))));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static String deadline(long hoursFromNow) {
        return OffsetDateTime.now(ZoneOffset.UTC).plusHours(hoursFromNow).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    private static String body(String version, String title, String pickup, String pickupName, String dropoff,
            String reward, String deadline) {
        return """
                {
                  "version": %s,
                  "title": %s,
                  "description": "Grab my printout from COM1",
                  "pickupLocationId": %s,
                  "pickupLocationName": %s,
                  "dropoffLocationId": %s,
                  "dropoffLocationName": "UTown Residence",
                  "creditReward": %s,
                  "pickupDeadline": %s
                }
                """.formatted(version, json(title), json(pickup), json(pickupName), json(dropoff), reward,
                json(deadline));
    }

    private static String json(String value) {
        return value == null ? "null" : "\"" + value + "\"";
    }

    private static String validBody() {
        return body("1", "  Collect printing  ", PICKUP, "COM1 Print Shop", DROPOFF, "12", deadline(24));
    }

    private ResultActions patchOrder(String requestBody) throws Exception {
        return mockMvc.perform(patch("/api/orders/{id}", ORDER_ID)
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody));
    }

    private static Order editedOrder() {
        Order order = Order.submit(REQUESTER, "Collect printing", "Grab my printout from COM1",
                UUID.fromString(PICKUP), "COM1 Print Shop", UUID.fromString(DROPOFF), "UTown Residence", 10,
                OffsetDateTime.now(ZoneOffset.UTC).plusDays(1));
        ReflectionTestUtils.setField(order, "id", ORDER_ID);
        ReflectionTestUtils.setField(order, "state", OrderState.OPEN);
        ReflectionTestUtils.setField(order, "version", 2L);
        ReflectionTestUtils.setField(order, "pendingCreditReward", 12);
        return order;
    }

    @Test
    void editsTheOrderAndShowsTheRewardAsPending() throws Exception {
        when(orderService.edit(eq(ORDER_ID), eq(REQUESTER), eq(1L), any(OrderDetails.class))).thenReturn(editedOrder());

        patchOrder(validBody())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(ORDER_ID.toString()))
                .andExpect(jsonPath("$.creditReward").value(10))
                .andExpect(jsonPath("$.pendingCreditReward").value(12))
                .andExpect(jsonPath("$.version").value(2));

        ArgumentCaptor<OrderDetails> details = ArgumentCaptor.forClass(OrderDetails.class);
        verify(orderService).edit(eq(ORDER_ID), eq(REQUESTER), eq(1L), details.capture());
        org.assertj.core.api.Assertions.assertThat(details.getValue().title()).isEqualTo("Collect printing");
        org.assertj.core.api.Assertions.assertThat(details.getValue().creditReward()).isEqualTo(12);
    }

    @Test
    void appliesTheCreateRulesToEveryField() throws Exception {
        List<String> invalid = List.of(
                body("null", "Collect printing", PICKUP, "COM1 Print Shop", DROPOFF, "12", deadline(24)),
                body("-1", "Collect printing", PICKUP, "COM1 Print Shop", DROPOFF, "12", deadline(24)),
                body("1", "   ", PICKUP, "COM1 Print Shop", DROPOFF, "12", deadline(24)),
                body("1", "x".repeat(121), PICKUP, "COM1 Print Shop", DROPOFF, "12", deadline(24)),
                body("1", "Collect printing", null, "COM1 Print Shop", DROPOFF, "12", deadline(24)),
                body("1", "Collect printing", PICKUP, " ", DROPOFF, "12", deadline(24)),
                body("1", "Collect printing", PICKUP, "x".repeat(161), DROPOFF, "12", deadline(24)),
                body("1", "Collect printing", PICKUP, "COM1 Print Shop", PICKUP, "12", deadline(24)),
                body("1", "Collect printing", PICKUP, "COM1 Print Shop", DROPOFF, "0", deadline(24)),
                body("1", "Collect printing", PICKUP, "COM1 Print Shop", DROPOFF, "null", deadline(24)),
                body("1", "Collect printing", PICKUP, "COM1 Print Shop", DROPOFF, "12", deadline(-1)),
                body("1", "Collect printing", PICKUP, "COM1 Print Shop", DROPOFF, "12", null));
        for (String requestBody : invalid) {
            patchOrder(requestBody)
                    .andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.errors").isMap());
        }
        verify(orderService, never()).edit(any(), any(), anyLong(), any());
    }

    @Test
    void rejectsAMalformedBody() throws Exception {
        patchOrder("{\"version\": 1, \"title\": ").andExpect(status().isBadRequest());
        verify(orderService, never()).edit(any(), any(), anyLong(), any());
    }

    @Test
    void reportsAMissingOrderAsNotFound() throws Exception {
        when(orderService.edit(any(), any(), anyLong(), any())).thenThrow(new OrderNotFoundException(ORDER_ID));

        patchOrder(validBody())
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ORDER_NOT_FOUND"));
    }

    @Test
    void reportsANonRequesterAsForbidden() throws Exception {
        when(orderService.edit(any(), any(), anyLong(), any())).thenThrow(new OrderTransitionException(
                OrderErrorCode.NOT_ORDER_REQUESTER, OrderState.OPEN, "Only the order's requester can edit it"));

        patchOrder(validBody())
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("NOT_ORDER_REQUESTER"))
                .andExpect(jsonPath("$.currentState").value("OPEN"));
    }

    @Test
    void reportsStatePendingAndExpiryConflicts() throws Exception {
        when(orderService.edit(any(), any(), anyLong(), any()))
                .thenThrow(new OrderTransitionException(OrderErrorCode.INVALID_STATE_TRANSITION, OrderState.ACCEPTED,
                        "Cannot edit an order in state ACCEPTED"))
                .thenThrow(new OrderTransitionException(OrderErrorCode.REWARD_ADJUSTMENT_PENDING, OrderState.OPEN,
                        "A reward change is waiting for Credit"))
                .thenThrow(new OrderExpiredOnActionException());

        patchOrder(validBody())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVALID_STATE_TRANSITION"))
                .andExpect(jsonPath("$.currentState").value("ACCEPTED"));
        patchOrder(validBody())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REWARD_ADJUSTMENT_PENDING"))
                .andExpect(jsonPath("$.currentState").value("OPEN"));
        patchOrder(validBody())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ORDER_EXPIRED"))
                .andExpect(jsonPath("$.currentState").value("EXPIRED"));
    }

    @Test
    void reportsAStaleVersionWithTheCurrentVersion() throws Exception {
        when(orderService.edit(any(), any(), anyLong(), any()))
                .thenThrow(new OrderVersionConflictException(OrderState.OPEN, 1, 4));

        patchOrder(validBody())
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"))
                .andExpect(jsonPath("$.currentState").value("OPEN"))
                .andExpect(jsonPath("$.currentVersion").value(4));
    }
}
