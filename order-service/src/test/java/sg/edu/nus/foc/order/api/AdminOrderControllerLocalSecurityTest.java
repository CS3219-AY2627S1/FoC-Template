package sg.edu.nus.foc.order.api;

import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import sg.edu.nus.foc.order.api.mapper.OrderMapperImpl;
import sg.edu.nus.foc.order.application.OrderQueryService;
import sg.edu.nus.foc.order.application.AdminOrderCancellationService;
import sg.edu.nus.foc.order.config.SecurityConfiguration;
import sg.edu.nus.foc.order.domain.repository.OrderPage;
import sg.edu.nus.foc.order.domain.Order;

@WebMvcTest(controllers = AdminOrderController.class)
@ActiveProfiles("local")
@Import({SecurityConfiguration.class, OrderMapperImpl.class})
class AdminOrderControllerLocalSecurityTest {
    @MockitoBean private sg.edu.nus.foc.order.application.AdminApplyPenaltyService penalties;
    @MockitoBean private sg.edu.nus.foc.order.application.OrderCompletionHoldService reviewHolds;

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private OrderQueryService queries;

    @MockitoBean
    private AdminOrderCancellationService cancellations;


    @Test
    void localAdminOrderEndpointDoesNotRequireAuthenticationOrAdminRole() throws Exception {
        when(queries.allOrders(null, 0, 20)).thenReturn(new OrderPage(List.of(), 0, 20, 0, 0));

        mockMvc.perform(get("/api/orders"))
                .andExpect(status().isOk());
    }

    @Test
    void removedAdminCompletionReturnsNotFound() throws Exception {
        mockMvc.perform(post("/api/orders/admin/order-id/complete").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNotFound());
    }
}
