package sg.edu.nus.foc.order.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;
import org.springframework.data.domain.PageRequest;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.security.access.prepost.PreAuthorize;
import sg.edu.nus.foc.order.api.dto.response.OrderPageResponse;
import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.application.OrderQueryService;
import sg.edu.nus.foc.order.application.AdminOrderCancellationService;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.OrderPage;

class AdminOrderControllerTest {
    private static final Instant CREATED_AT = Instant.parse("2026-10-01T00:00:00Z");

    private OrderQueryService queries;
    private AdminOrderController controller;

    @BeforeEach
    void setUp() {
        queries = mock(OrderQueryService.class);
        OrderMapper mapper = Mappers.getMapper(OrderMapper.class);
        controller = new AdminOrderController(queries, mapper, mock(AdminOrderCancellationService.class), mock(sg.edu.nus.foc.order.application.OrderCompletionHoldService.class), mock(sg.edu.nus.foc.order.application.AdminApplyPenaltyService.class));
    }

    @Test
    void omittedStatusListsAllStatusesAndMapsOneBasedResponsePage() {
        Order order = Order.open("requester", "item", "pickup", "delivery", 3, 30,
                CREATED_AT, CREATED_AT.plusSeconds(3600));
        when(queries.allOrders(null, 1, 25))
                .thenReturn(new OrderPage(List.of(order), 1, 25, 26, 2));

        OrderPageResponse response = controller.listOrders(null, PageRequest.of(1, 25), null, null, null, false);

        verify(queries).allOrders(null, 1, 25);
        assertEquals(2, response.getPage());
        assertEquals(25, response.getSize());
        assertEquals(26, response.getTotalItems());
        assertEquals(2, response.getTotalPages());
        assertEquals(OrderStatus.OPEN.name(), response.getItems().getFirst().getStatus());
    }

    @Test
    void suppliedStatusIsForwardedToQueryService() {
        when(queries.allOrders(OrderStatus.DELIVERED, 0, 10))
                .thenReturn(new OrderPage(List.of(), 0, 10, 0, 0));

        OrderPageResponse response = controller.listOrders(OrderStatus.DELIVERED, PageRequest.of(0, 10), null, null, null, false);

        verify(queries).allOrders(OrderStatus.DELIVERED, 0, 10);
        assertNotNull(response);
        assertTrue(response.getItems().isEmpty());
    }

    @Test
    void endpointRequiresTheAdminAuthority() throws NoSuchMethodException {
        PreAuthorize authorization = AnnotatedElementUtils.findMergedAnnotation(
                AdminOrderController.class.getMethod(
                        "listOrders", OrderStatus.class, org.springframework.data.domain.Pageable.class, String.class, Instant.class, Instant.class, boolean.class),
                PreAuthorize.class);

        assertNotNull(authorization);
        assertEquals("hasRole('ADMIN')", authorization.value());
    }
}
