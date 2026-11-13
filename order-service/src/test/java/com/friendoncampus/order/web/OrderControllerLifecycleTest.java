package com.friendoncampus.order.web;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.friendoncampus.order.domain.ActorRole;
import com.friendoncampus.order.domain.CreditEffect;
import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderAction;
import com.friendoncampus.order.domain.OrderErrorCode;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.domain.OrderTransition;
import com.friendoncampus.order.domain.OrderTransitionException;
import com.friendoncampus.order.domain.OrderTransitionRecord;
import com.friendoncampus.order.service.OrderNotFoundException;
import com.friendoncampus.order.service.OrderService;
import com.friendoncampus.order.web.error.ApiExceptionHandler;

/** Read and cancel endpoints, including their problem+json error codes. */
class OrderControllerLifecycleTest {

    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID ORDER_ID = UUID.fromString("3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64");

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

    private static Order order(OrderState state) {
        Order order = Order.submit(REQUESTER, "Collect printing", "Grab my printout",
                UUID.randomUUID(), "COM1 Print Shop", UUID.randomUUID(), "UTown Residence", 10, OffsetDateTime.now(ZoneOffset.UTC).plusDays(1));
        ReflectionTestUtils.setField(order, "id", ORDER_ID);
        ReflectionTestUtils.setField(order, "state", state);
        return order;
    }

    @Test
    void getsAnOrderTheCallerMaySee() throws Exception {
        when(orderService.getOrder(ORDER_ID, REQUESTER)).thenReturn(order(OrderState.OPEN));

        mockMvc.perform(get("/api/orders/{id}", ORDER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(ORDER_ID.toString()))
                .andExpect(jsonPath("$.state").value("OPEN"));
    }

    @Test
    void reportsAHiddenOrMissingOrderAsNotFoundWithACode() throws Exception {
        when(orderService.getOrder(ORDER_ID, REQUESTER)).thenThrow(new OrderNotFoundException(ORDER_ID));

        mockMvc.perform(get("/api/orders/{id}", ORDER_ID))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("ORDER_NOT_FOUND"))
                .andExpect(jsonPath("$.orderId").value(ORDER_ID.toString()));
    }

    @Test
    void listsTheHistoryOldestFirst() throws Exception {
        OffsetDateTime t0 = OffsetDateTime.of(2026, 10, 16, 12, 0, 0, 0, ZoneOffset.UTC);
        Order order = order(OrderState.PENDING_CREDIT);
        List<OrderTransitionRecord> history = List.of(
                OrderTransitionRecord.of(ORDER_ID, 0, order.submitted(t0)),
                OrderTransitionRecord.of(ORDER_ID, 1, new OrderTransition(
                        OrderAction.OPEN, OrderState.PENDING_CREDIT, OrderState.OPEN, null, ActorRole.SYSTEM,
                        null, null, CreditEffect.NONE, "OrderOpened", t0.plusSeconds(5))));
        when(orderService.getHistory(ORDER_ID, REQUESTER)).thenReturn(history);

        mockMvc.perform(get("/api/orders/{id}/history", ORDER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].action").value("SUBMIT"))
                .andExpect(jsonPath("$[1].toState").value("OPEN"))
                .andExpect(jsonPath("$[1].actorRole").value("SYSTEM"));
    }

    @Test
    void cancelsAnOrder() throws Exception {
        Order cancelled = order(OrderState.CANCELLED);
        when(orderService.cancel(eq(ORDER_ID), eq(REQUESTER))).thenReturn(cancelled);

        mockMvc.perform(post("/api/orders/{id}/cancel", ORDER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("CANCELLED"));
    }

    @Test
    void cancelAfterPickupIsAConflictWithTheCurrentState() throws Exception {
        when(orderService.cancel(eq(ORDER_ID), eq(REQUESTER))).thenThrow(new OrderTransitionException(
                OrderErrorCode.CANCELLATION_NOT_ALLOWED, OrderState.PICKED_UP, "Orders cannot be cancelled once picked up"));

        mockMvc.perform(post("/api/orders/{id}/cancel", ORDER_ID))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("CANCELLATION_NOT_ALLOWED"))
                .andExpect(jsonPath("$.currentState").value("PICKED_UP"));
    }

    @Test
    void cancellingSomeoneElsesOrderIsForbidden() throws Exception {
        when(orderService.cancel(eq(ORDER_ID), eq(REQUESTER))).thenThrow(new OrderTransitionException(
                OrderErrorCode.NOT_ORDER_REQUESTER, OrderState.OPEN, "Only the order's requester can cancel it"));

        mockMvc.perform(post("/api/orders/{id}/cancel", ORDER_ID))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("NOT_ORDER_REQUESTER"));
    }

    @Test
    void acceptsAnOrder() throws Exception {
        Order accepted = order(OrderState.ACCEPTED);
        when(orderService.accept(eq(ORDER_ID), eq(REQUESTER))).thenReturn(accepted);

        mockMvc.perform(post("/api/orders/{id}/accept", ORDER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("ACCEPTED"));
    }

    @Test
    void losingAnAcceptanceRaceIsAConflict() throws Exception {
        when(orderService.accept(eq(ORDER_ID), eq(REQUESTER))).thenThrow(new OrderTransitionException(
                OrderErrorCode.ORDER_ALREADY_ACCEPTED, OrderState.ACCEPTED, "taken"));

        mockMvc.perform(post("/api/orders/{id}/accept", ORDER_ID))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ORDER_ALREADY_ACCEPTED"))
                .andExpect(jsonPath("$.currentState").value("ACCEPTED"));
    }

    @Test
    void acceptingAnExpiredOrderExplainsWhy() throws Exception {
        when(orderService.accept(eq(ORDER_ID), eq(REQUESTER)))
                .thenThrow(new com.friendoncampus.order.service.OrderExpiredOnActionException());

        mockMvc.perform(post("/api/orders/{id}/accept", ORDER_ID))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ORDER_EXPIRED"))
                .andExpect(jsonPath("$.currentState").value("EXPIRED"));
    }

    @Test
    void acceptingYourOwnOrderIsForbidden() throws Exception {
        when(orderService.accept(eq(ORDER_ID), eq(REQUESTER))).thenThrow(new OrderTransitionException(
                OrderErrorCode.SELF_ACCEPTANCE_FORBIDDEN, OrderState.OPEN, "own order"));

        mockMvc.perform(post("/api/orders/{id}/accept", ORDER_ID))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("SELF_ACCEPTANCE_FORBIDDEN"));
    }

    @Test
    void withdrawsFromAnOrder() throws Exception {
        when(orderService.withdraw(eq(ORDER_ID), eq(REQUESTER))).thenReturn(order(OrderState.OPEN));

        mockMvc.perform(post("/api/orders/{id}/withdraw", ORDER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("OPEN"));
    }

    @Test
    void withdrawingFromSomeoneElsesAssignmentIsForbidden() throws Exception {
        when(orderService.withdraw(eq(ORDER_ID), eq(REQUESTER))).thenThrow(new OrderTransitionException(
                OrderErrorCode.NOT_ASSIGNED_COURIER, OrderState.ACCEPTED, "not yours"));

        mockMvc.perform(post("/api/orders/{id}/withdraw", ORDER_ID))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("NOT_ASSIGNED_COURIER"));
    }

    @Test
    void picksUpDeliversAndCompletesAnOrder() throws Exception {
        when(orderService.pickUp(eq(ORDER_ID), eq(REQUESTER))).thenReturn(order(OrderState.PICKED_UP));
        when(orderService.deliver(eq(ORDER_ID), eq(REQUESTER))).thenReturn(order(OrderState.DELIVERED));
        when(orderService.complete(eq(ORDER_ID), eq(REQUESTER))).thenReturn(order(OrderState.COMPLETED));

        mockMvc.perform(post("/api/orders/{id}/pickup", ORDER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("PICKED_UP"));
        mockMvc.perform(post("/api/orders/{id}/deliver", ORDER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("DELIVERED"));
        mockMvc.perform(post("/api/orders/{id}/complete", ORDER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("COMPLETED"));
    }

    @Test
    void completingBeforeDeliveryIsAConflict() throws Exception {
        when(orderService.complete(eq(ORDER_ID), eq(REQUESTER))).thenThrow(new OrderTransitionException(
                OrderErrorCode.INVALID_STATE_TRANSITION, OrderState.PICKED_UP, "not delivered yet"));

        mockMvc.perform(post("/api/orders/{id}/complete", ORDER_ID))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVALID_STATE_TRANSITION"))
                .andExpect(jsonPath("$.currentState").value("PICKED_UP"));
    }
}
