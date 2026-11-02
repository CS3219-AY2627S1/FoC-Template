/* AI assistance: OpenAI Codex, 2026-10-30. Report credit context and response reminders; human review pending. */
package sg.edu.nus.foc.order.api;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import sg.edu.nus.foc.order.api.mapper.OrderMapperImpl;
import sg.edu.nus.foc.order.application.OrderQueryService;
import sg.edu.nus.foc.order.config.ProductionMethodSecurityConfiguration;
import sg.edu.nus.foc.order.config.SecurityConfiguration;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.repository.OrderPage;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;
import sg.edu.nus.foc.order.security.RoleProvider;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = OrderCreditHistoryController.class)
@ActiveProfiles("prod")
@Import({SecurityConfiguration.class, ProductionMethodSecurityConfiguration.class, OrderMapperImpl.class, OrderQueryService.class})
class OrderCreditHistoryControllerTest {
    @Autowired private MockMvc mvc;
    @MockitoBean private OrderRepository orders;
    @MockitoBean private RoleProvider roles;
    @MockitoBean private JwtDecoder decoder;

    @Test void scopesPagesToThePrincipalAndMapsActualStartTime() throws Exception {
        Instant start = Instant.parse("2026-10-30T00:00:00Z");
        Order order = Order.open("owner", "Books", "a", "b", 2, 30, start, start.plusSeconds(3600));
        order.accept("courier", 0, start);
        order.start("courier", 0, start);
        order.markPickedUp("courier", 0);
        order.markDelivered("courier", 0, start.plusSeconds(600));
        order.confirmCompletion("owner", 0);
        when(orders.findCreditHistoryInvolving("courier", OrderStatus.COMPLETED, 0, 20)).thenReturn(new OrderPage(List.of(order), 0, 20, 1, 1));
        mvc.perform(get("/api/orders/mine/completed").with(user("courier").roles("COURIER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].status").value("COMPLETED"))
                .andExpect(jsonPath("$.items[0].startedAt").value(start.toString()));
        verify(orders).findCreditHistoryInvolving("courier", OrderStatus.COMPLETED, 0, 20);
        when(orders.getCreditHistoryInvolving(order.getId(), "owner", OrderStatus.COMPLETED)).thenReturn(Optional.of(order));
        mvc.perform(get("/api/orders/mine/completed/" + order.getId()).with(user("owner").roles("REQUESTER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(order.getId()));
    }

    @Test void rejectsAnonymousInvalidPagingAndUnavailableContext() throws Exception {
        mvc.perform(get("/api/orders/mine/completed")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/orders/mine/completed").with(user("u").roles("OTHER"))).andExpect(status().isForbidden());
        for (String query : List.of("?page=0", "?size=0", "?size=101")) {
            mvc.perform(get("/api/orders/mine/completed" + query).with(user("u").roles("REQUESTER")))
                    .andExpect(status().isBadRequest());
        }
        when(orders.getCreditHistoryInvolving("unrelated", "u", OrderStatus.COMPLETED)).thenReturn(Optional.empty());
        mvc.perform(get("/api/orders/mine/completed/unrelated").with(user("u").roles("COURIER")))
                .andExpect(status().isNotFound());
        OrderCreditHistoryController controller = new OrderCreditHistoryController(new OrderQueryService(orders), new OrderMapperImpl());
        assertThrows(OrderProblem.class, () -> controller.list(null, 1, 20));
        assertThrows(OrderProblem.class, () -> controller.detail("x", () -> ""));
    }
    @Test void cancelledHistoryIsCallerScopedAndRejectsUnavailableOrders() throws Exception {
        Instant now = Instant.parse("2026-10-30T00:00:00Z");
        Order order = Order.open("owner", "Books", "a", "b", 2, 30, now, now.plusSeconds(3600));
        order.cancelOpen("owner", 0);
        when(orders.findCreditHistoryInvolving("owner", OrderStatus.CANCELLED, 0, 20))
                .thenReturn(new OrderPage(List.of(order), 0, 20, 1, 1));
        mvc.perform(get("/api/orders/mine/cancelled").with(user("owner").roles("REQUESTER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].status").value("CANCELLED"));
        when(orders.getCreditHistoryInvolving(order.getId(), "owner", OrderStatus.CANCELLED)).thenReturn(Optional.of(order));
        mvc.perform(get("/api/orders/mine/cancelled/" + order.getId()).with(user("owner").roles("COURIER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(order.getId()));
        when(orders.getCreditHistoryInvolving(order.getId(), "outsider", OrderStatus.CANCELLED)).thenReturn(Optional.empty());
        mvc.perform(get("/api/orders/mine/cancelled/" + order.getId()).with(user("outsider").roles("REQUESTER")))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/orders/mine/cancelled")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/orders/mine/cancelled?page=0").with(user("owner").roles("REQUESTER")))
                .andExpect(status().isBadRequest());
    }

}
