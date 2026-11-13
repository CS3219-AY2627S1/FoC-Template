package sg.edu.nus.foc.order.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
import sg.edu.nus.foc.order.api.mapper.OrderMapperImpl;
import sg.edu.nus.foc.order.application.AdminOrderCancellationService;
import sg.edu.nus.foc.order.application.OrderQueryService;
import sg.edu.nus.foc.order.config.ProductionMethodSecurityConfiguration;
import sg.edu.nus.foc.order.config.SecurityConfiguration;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.security.Role;
import sg.edu.nus.foc.order.security.RoleProvider;

@WebMvcTest(AdminOrderController.class)
@ActiveProfiles("prod")
@Import({SecurityConfiguration.class, ProductionMethodSecurityConfiguration.class, OrderMapperImpl.class})
class AdminOrderCancellationControllerTest {
    @MockitoBean private sg.edu.nus.foc.order.application.AdminApplyPenaltyService penalties;
    @MockitoBean private sg.edu.nus.foc.order.application.OrderCompletionHoldService reviewHolds;

    private static final String PATH = "/api/orders/admin/order-1/cancel";
    private static final String BODY = """
            {"requesterId":"requester","courierId":"courier","appliedPenalties":["WRONG_LOCATION_DELIVERY"]}
            """;

    @Autowired private MockMvc mvc;
    @MockitoBean private AdminOrderCancellationService cancellations;

    @MockitoBean private OrderQueryService queries;
    @MockitoBean private JwtDecoder jwtDecoder;
    @MockitoBean private RoleProvider roles;

    @Test
    void onlyAdministratorsCanCallTheRoute() throws Exception {
        mvc.perform(post(PATH).contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isUnauthorized());
        mvc.perform(post(PATH).with(user("courier").roles("COURIER"))
                .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isForbidden());
        verifyNoInteractions(cancellations);
    }

    @Test
    void verifiedTokenAndUserServiceRoleSupplyTheAdminIdentity() throws Exception {
        Jwt caller = Jwt.withTokenValue("admin-token").header("alg", "RS256").subject("admin").build();
        when(jwtDecoder.decode("admin-token")).thenReturn(caller);
        when(roles.rolesFor(caller)).thenReturn(Set.of(Role.ADMIN));
        Instant created = Instant.parse("2026-10-16T00:00:00Z");
        Order order = Order.open("requester", "item", "pickup", "delivery", 5, 30, created, created.plusSeconds(3600));
        order.accept("courier", 0, created.plusSeconds(1));
        order.cancelByAdmin("requester", "courier");
        when(cancellations.cancel("order-1", "requester", "courier",
                List.of(PenaltySystemPolicy.WRONG_LOCATION_DELIVERY), "admin", null)).thenReturn(order);
        mvc.perform(post(PATH).header("Authorization", "Bearer admin-token")
                .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.isOverdue").hasJsonPath())
                .andExpect(jsonPath("$.overdue").doesNotExist());
        verify(roles).rolesFor(caller);
        verify(cancellations).cancel("order-1", "requester", "courier", List.of(PenaltySystemPolicy.WRONG_LOCATION_DELIVERY), "admin", null);
    }

    @Test
    void rejectsMalformedPolicyListsAndMissingRequesterBeforeService() throws Exception {
        for (String invalid : List.of("{\"requesterId\":\"\"}",
                "{\"requesterId\":\"requester\",\"appliedPenalties\":[null]}",
                "{\"requesterId\":\"requester\",\"appliedPenalties\":[\"UNKNOWN\"]}")) {
            mvc.perform(post(PATH).with(user("admin").roles("ADMIN"))
                    .contentType(MediaType.APPLICATION_JSON).content(invalid)).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(cancellations);
    }

    @Test
    void domainConflictsRemainConflictsRatherThanPendingRecovery() throws Exception {
        when(cancellations.cancel(eq("order-1"), eq("requester"), eq("courier"), any(), eq("admin"), org.mockito.ArgumentMatchers.isNull()))
                .thenThrow(OrderProblem.conflict("Order participants do not match."));
        mvc.perform(post(PATH).with(user("admin").roles("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("CONFLICT"));
    }

    @Test
    void databaseLockContentionReturnsAnActionableConflict() throws Exception {
        when(cancellations.cancel(eq("order-1"), eq("requester"), eq("courier"), any(), eq("admin"), org.mockito.ArgumentMatchers.isNull()))
                .thenThrow(new org.springframework.dao.CannotAcquireLockException("Order row is locked"));
        mvc.perform(post(PATH).with(user("admin").roles("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("CONFLICT"))
                .andExpect(jsonPath("$.message").value("This order is being updated. Please retry the cancellation."));
    }
}
