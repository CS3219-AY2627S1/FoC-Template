package sg.edu.nus.foc.order.api;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.ArgumentMatchers.isNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.application.LifecycleProcessingService;
import sg.edu.nus.foc.order.application.OrderAssignmentService;
import sg.edu.nus.foc.order.application.OrderCreationService;
import sg.edu.nus.foc.order.application.OrderQueryService;
import sg.edu.nus.foc.order.application.OrderRepostService;
import sg.edu.nus.foc.order.application.OrderTransitionService;
import sg.edu.nus.foc.order.application.UserServicePort;
import sg.edu.nus.foc.order.domain.repository.OrderPage;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.OrderProblem;

class OrderMineStatusFilterTest {

    private MockMvc mvc;
    private OrderQueryService queries;
    private UserServicePort users;

    @BeforeEach
    void setUp() {
        queries = mock(OrderQueryService.class);
        users = mock(UserServicePort.class);
        when(users.verifyRequester("user", null)).thenReturn("user");
        when(queries.requestedBy(anyString(), isNull(), anyInt(), anyInt()))
                .thenReturn(new OrderPage(List.of(), 0, 20, 0, 0));
        OrderController controller = new OrderController(
                mock(OrderCreationService.class), mock(OrderAssignmentService.class),
                mock(OrderTransitionService.class), queries, mock(OrderRepostService.class),
                mock(LifecycleProcessingService.class), users, Mappers.getMapper(OrderMapper.class));
        mvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new OrderExceptionHandler()).build();
    }

    @Test
    void invalidStatusReturnsValidationErrorRatherThanAnUnfilteredList() throws Exception {
        mvc.perform(get("/api/orders/mine")
                .param("mode", "requester").param("userId", "user").param("status", "INVALID"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"));
    }

    @Test
    void selectedStatusAndOneBasedPageAreForwardedAfterRequesterVerification() throws Exception {
        when(queries.requestedBy("user", OrderStatus.COMPLETED, 1, 10))
                .thenReturn(new OrderPage(List.of(), 1, 10, 14, 2));
        mvc.perform(get("/api/orders/mine").param("mode", "requester").param("userId", "user")
                .param("status", "COMPLETED").param("page", "2").param("size", "10"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page").value(2))
                .andExpect(jsonPath("$.totalItems").value(14)).andExpect(jsonPath("$.totalPages").value(2));
        verify(users).verifyRequester("user", null);
        verify(queries).requestedBy("user", OrderStatus.COMPLETED, 1, 10);
    }

    @Test
    void courierAbortedFilterRetainsTheVerifiedCourierScope() throws Exception {
        when(users.verifyCourier("user", null)).thenReturn("user");
        when(queries.courierFor("user", OrderStatus.ABORTED, 0, 20))
                .thenReturn(new OrderPage(List.of(), 0, 20, 0, 0));
        mvc.perform(get("/api/orders/mine").param("mode", "courier").param("userId", "user")
                .param("status", "ABORTED")).andExpect(status().isOk());
        verify(users).verifyCourier("user", null);
        verify(queries).courierFor("user", OrderStatus.ABORTED, 0, 20);
    }

    @Test
    void omittedAndEmptyStatusUseAllStatuses() throws Exception {
        mvc.perform(get("/api/orders/mine").param("mode", "requester").param("userId", "user"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/orders/mine").param("mode", "requester").param("userId", "user")
                .param("status", "")).andExpect(status().isOk());
    }

    @Test
    void identityFailureAndInvalidModeNeverQueryPersonalOrders() throws Exception {
        when(users.verifyRequester("user", null)).thenThrow(OrderProblem.forbidden("Wrong requester."));
        mvc.perform(get("/api/orders/mine").param("mode", "requester").param("userId", "user")
                .param("status", "OPEN")).andExpect(status().isForbidden());
        mvc.perform(get("/api/orders/mine").param("mode", "admin").param("userId", "user")
                .param("status", "OPEN")).andExpect(status().isBadRequest());
        verifyNoInteractions(queries);
    }
}
