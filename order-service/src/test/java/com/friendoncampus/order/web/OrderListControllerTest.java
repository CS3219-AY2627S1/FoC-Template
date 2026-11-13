package com.friendoncampus.order.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.service.MyOrdersFilter;
import com.friendoncampus.order.service.OrderPaging;
import com.friendoncampus.order.service.OrderPoolQuery;
import com.friendoncampus.order.service.OrderPoolSort;
import com.friendoncampus.order.service.OrderQueryService;
import com.friendoncampus.order.service.OrderService;
import com.friendoncampus.order.web.error.ApiExceptionHandler;

/** Open pool and history list endpoints: parameter parsing, defaults, errors and routing. */
class OrderListControllerTest {

    private static final UUID CALLER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID ORDER_ID = UUID.fromString("3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64");
    private static final UUID PICKUP = UUID.fromString("ca9bd61f-93da-4500-9e9d-48de1bea52fa");
    private static final UUID DROPOFF = UUID.fromString("184a5d15-0714-47ad-9ee9-524bf84f361c");

    private OrderQueryService queryService;
    private OrderService orderService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        queryService = mock(OrderQueryService.class);
        orderService = mock(OrderService.class);
        // Both controllers share /api/orders, as in the application, so routing is tested too.
        mockMvc = MockMvcBuilders
                .standaloneSetup(new OrderListController(queryService), new OrderController(orderService))
                .setControllerAdvice(new ApiExceptionHandler())
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();
        Jwt jwt = Jwt.withTokenValue("test-token")
                .header("alg", "RS256")
                .subject(CALLER.toString())
                .claim("role", "COURIER")
                .build();
        SecurityContextHolder.getContext().setAuthentication(
                new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_COURIER"))));
        Page<Order> empty = Page.empty(PageRequest.of(0, 20));
        when(queryService.findOpenPool(any(), any())).thenReturn(empty);
        when(queryService.findRequested(any(), any(), any())).thenReturn(empty);
        when(queryService.findDelivered(any(), any(), any())).thenReturn(empty);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static Order openOrder() {
        Order order = Order.submit(UUID.randomUUID(), "Collect printing", "Grab my printout",
                PICKUP, "COM1 Print Shop", DROPOFF, "UTown Residence", 10,
                OffsetDateTime.now(ZoneOffset.UTC).plusDays(1));
        ReflectionTestUtils.setField(order, "id", ORDER_ID);
        ReflectionTestUtils.setField(order, "state", OrderState.OPEN);
        return order;
    }

    private OrderPoolQuery capturedPoolQuery() {
        ArgumentCaptor<OrderPoolQuery> captor = ArgumentCaptor.forClass(OrderPoolQuery.class);
        verify(queryService).findOpenPool(eq(CALLER), captor.capture());
        return captor.getValue();
    }

    @Test
    void poolDefaultsToNearestDeadlineFirstPageOfTwenty() throws Exception {
        mockMvc.perform(get("/api/orders"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.totalItems").value(0))
                .andExpect(jsonPath("$.totalPages").value(0));

        OrderPoolQuery query = capturedPoolQuery();
        assertThat(query.sort()).isEqualTo(OrderPoolSort.DEADLINE);
        assertThat(query.paging()).isEqualTo(new OrderPaging(0, 20));
        assertThat(query.minReward()).isNull();
        assertThat(query.maxReward()).isNull();
        assertThat(query.pickupLocationId()).isNull();
        assertThat(query.dropoffLocationId()).isNull();
    }

    @Test
    void poolPassesFiltersSortAndPagingAndReturnsThePage() throws Exception {
        when(queryService.findOpenPool(any(), any()))
                .thenReturn(new PageImpl<>(List.of(openOrder()), PageRequest.of(1, 5), 6));

        mockMvc.perform(get("/api/orders")
                        .param("minReward", "5").param("maxReward", "20")
                        .param("pickupLocationId", PICKUP.toString())
                        .param("dropoffLocationId", DROPOFF.toString())
                        .param("sort", "reward").param("page", "1").param("size", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(ORDER_ID.toString()))
                .andExpect(jsonPath("$.items[0].pickupLocationName").value("COM1 Print Shop"))
                .andExpect(jsonPath("$.items[0].state").value("OPEN"))
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(5))
                .andExpect(jsonPath("$.totalItems").value(6))
                .andExpect(jsonPath("$.totalPages").value(2));

        OrderPoolQuery query = capturedPoolQuery();
        assertThat(query.minReward()).isEqualTo(5);
        assertThat(query.maxReward()).isEqualTo(20);
        assertThat(query.pickupLocationId()).isEqualTo(PICKUP);
        assertThat(query.dropoffLocationId()).isEqualTo(DROPOFF);
        assertThat(query.sort()).isEqualTo(OrderPoolSort.REWARD);
        assertThat(query.paging()).isEqualTo(new OrderPaging(1, 5));
    }

    @Test
    void poolAcceptsEachSortAndEqualRewardBoundsAndBlankFilters() throws Exception {
        mockMvc.perform(get("/api/orders").param("sort", "pickupLocationName")
                        .param("minReward", "7").param("maxReward", "7").param("pickupLocationId", ""))
                .andExpect(status().isOk());
        OrderPoolQuery query = capturedPoolQuery();
        assertThat(query.sort()).isEqualTo(OrderPoolSort.PICKUP_LOCATION_NAME);
        assertThat(query.pickupLocationId()).isNull();
    }

    @ParameterizedTest(name = "{0}={1}")
    @CsvSource({
            "minReward, 0",
            "minReward, -3",
            "minReward, 1.5",
            "minReward, abc",
            "maxReward, 0",
            "maxReward, ten",
            "pickupLocationId, not-a-uuid",
            "dropoffLocationId, 123",
            "sort, newest",
            "sort, 'reward,desc'",
            "sort, ''",
            "page, -1",
            "page, x",
            "size, 0",
            "size, 51",
            "size, ''"
    })
    void poolRejectsInvalidParameters(String name, String value) throws Exception {
        mockMvc.perform(get("/api/orders").param(name, value))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("INVALID_QUERY"))
                .andExpect(jsonPath("$.title").value("Invalid order query"));
        verifyNoInteractions(queryService);
    }

    @Test
    void poolRejectsMinRewardAboveMaxReward() throws Exception {
        mockMvc.perform(get("/api/orders").param("minReward", "10").param("maxReward", "5"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_QUERY"))
                .andExpect(jsonPath("$.detail").value("minReward must be less than or equal to maxReward"));
        verifyNoInteractions(queryService);
    }

    @Test
    void requestedHistoryUsesTheCallerAndDefaultPaging() throws Exception {
        mockMvc.perform(get("/api/orders/me/requested"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.totalItems").value(0));
        verify(queryService).findRequested(CALLER, MyOrdersFilter.PAST, new OrderPaging(0, 20));
    }

    @Test
    void deliveredHistoryUsesTheCallerAndRequestedPaging() throws Exception {
        mockMvc.perform(get("/api/orders/me/delivered").param("page", "2").param("size", "50"))
                .andExpect(status().isOk());
        verify(queryService).findDelivered(CALLER, MyOrdersFilter.PAST, new OrderPaging(2, 50));
    }

    @Test
    void myListsPassTheStatusAndStateFilter() throws Exception {
        mockMvc.perform(get("/api/orders/me/requested").param("status", "active").param("state", "open"))
                .andExpect(status().isOk());
        verify(queryService).findRequested(CALLER,
                new MyOrdersFilter(MyOrdersFilter.Status.ACTIVE, OrderState.OPEN), new OrderPaging(0, 20));
        mockMvc.perform(get("/api/orders/me/delivered").param("status", "ACTIVE"))
                .andExpect(status().isOk());
        verify(queryService).findDelivered(CALLER,
                new MyOrdersFilter(MyOrdersFilter.Status.ACTIVE, null), new OrderPaging(0, 20));
    }

    @Test
    void myListsRejectAnUnknownStatusOrState() throws Exception {
        mockMvc.perform(get("/api/orders/me/requested").param("status", "finished"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_QUERY"));
        mockMvc.perform(get("/api/orders/me/delivered").param("state", "LOST"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_QUERY"));
        verifyNoInteractions(queryService);
    }

    @Test
    void adminListsUseThePathUserWithTheSameFilters() throws Exception {
        UUID user = UUID.randomUUID();
        mockMvc.perform(get("/api/orders/admin/users/{id}/requested", user).param("status", "active"))
                .andExpect(status().isOk());
        verify(queryService).findRequested(user,
                new MyOrdersFilter(MyOrdersFilter.Status.ACTIVE, null), new OrderPaging(0, 20));
        mockMvc.perform(get("/api/orders/admin/users/{id}/delivered", user).param("page", "1"))
                .andExpect(status().isOk());
        verify(queryService).findDelivered(user, MyOrdersFilter.PAST, new OrderPaging(1, 20));
    }

    @Test
    void adminListsRejectAMalformedUserId() throws Exception {
        mockMvc.perform(get("/api/orders/admin/users/not-a-uuid/requested"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_QUERY"));
        verifyNoInteractions(queryService);
    }

    @Test
    void historyRejectsInvalidPaging() throws Exception {
        mockMvc.perform(get("/api/orders/me/requested").param("size", "100"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_QUERY"));
        mockMvc.perform(get("/api/orders/me/delivered").param("page", "-1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_QUERY"));
        verifyNoInteractions(queryService);
    }

    @Test
    void meRoutesAreNotTreatedAsAnOrderId() throws Exception {
        mockMvc.perform(get("/api/orders/me/requested")).andExpect(status().isOk());
        mockMvc.perform(get("/api/orders/me/delivered")).andExpect(status().isOk());
        verifyNoInteractions(orderService);
    }

    @Test
    void getByIdStillWorksAlongsideTheListRoutes() throws Exception {
        when(orderService.getOrder(ORDER_ID, CALLER)).thenReturn(openOrder());

        mockMvc.perform(get("/api/orders/{id}", ORDER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(ORDER_ID.toString()));
        // A bare "me" is still an (invalid) order id, not a list.
        mockMvc.perform(get("/api/orders/me"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(queryService);
    }
}
