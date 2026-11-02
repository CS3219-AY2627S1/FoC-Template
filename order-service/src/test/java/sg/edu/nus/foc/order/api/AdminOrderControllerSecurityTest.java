package sg.edu.nus.foc.order.api;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
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
import sg.edu.nus.foc.order.application.AdminOrderCancellationService;
import sg.edu.nus.foc.order.config.SecurityConfiguration;
import sg.edu.nus.foc.order.config.ProductionMethodSecurityConfiguration;
import sg.edu.nus.foc.order.domain.repository.OrderPage;
import sg.edu.nus.foc.order.security.RoleProvider;

@WebMvcTest(controllers = AdminOrderController.class)
@ActiveProfiles("prod")
@Import({SecurityConfiguration.class, ProductionMethodSecurityConfiguration.class, OrderMapperImpl.class})
class AdminOrderControllerSecurityTest {
    @MockitoBean private sg.edu.nus.foc.order.application.AdminApplyPenaltyService penalties;
    @MockitoBean private sg.edu.nus.foc.order.application.OrderCompletionHoldService reviewHolds;
    @Test
    void actionEligibilityFilterIsOptionalAndRemainsAdminOnly() throws Exception {
        when(queries.allOrders(null, null, null, null, true, 0, 20))
                .thenReturn(new OrderPage(List.of(), 0, 20, 0, 0));
        mockMvc.perform(get("/api/orders").param("actionEligibleOnly", "true")
                .with(user("admin").roles("ADMIN"))).andExpect(status().isOk());
        verify(queries).allOrders(null, null, null, null, true, 0, 20);
        mockMvc.perform(get("/api/orders").param("actionEligibleOnly", "true")
                .with(user("courier").roles("COURIER"))).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/orders").param("actionEligibleOnly", "true"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/orders").param("actionEligibleOnly", "invalid")
                .with(user("admin").roles("ADMIN"))).andExpect(status().isBadRequest());
    }
    @Test
    void bindsCreationInstantsAndExactIdWithoutWeakeningAdminAuthorization() throws Exception {
        java.time.Instant from = java.time.Instant.parse("2026-10-15T16:00:00Z");
        java.time.Instant before = from.plusSeconds(86400);
        when(queries.allOrders(null, "order-1", from, before, 0, 20))
                .thenReturn(new OrderPage(List.of(), 0, 20, 0, 0));
        mockMvc.perform(get("/api/orders").param("orderId", "order-1")
                .param("createdFrom", from.toString()).param("createdBefore", before.toString())
                .with(user("admin").roles("ADMIN"))).andExpect(status().isOk());
        verify(queries).allOrders(null, "order-1", from, before, 0, 20);
        mockMvc.perform(get("/api/orders").param("createdFrom", "not-a-date")
                .with(user("admin").roles("ADMIN"))).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/orders").param("createdFrom", from.toString())
                .with(user("courier").roles("COURIER"))).andExpect(status().isForbidden());
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private OrderQueryService queries;

    @MockitoBean
    private AdminOrderCancellationService cancellations;


    @MockitoBean
    private RoleProvider roleProvider;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Test
    void anonymousRequestIsRejected() throws Exception {
        mockMvc.perform(get("/api/orders"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void swaggerUiWebjarAssetsArePublic() throws Exception {
        mockMvc.perform(get("/webjars/swagger-ui/index.html"))
                .andExpect(status().isOk());
    }

    @Test
    void authenticatedNonAdminIsRejected() throws Exception {
        mockMvc.perform(get("/api/orders").with(user("requester").roles("REQUESTER")))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminCanUseOneBasedPageAndOptionalStatus() throws Exception {
        when(queries.allOrders(null, 1, 10)).thenReturn(new OrderPage(List.of(), 1, 10, 11, 2));

        mockMvc.perform(get("/api/orders")
                        .param("page", "2")
                        .param("size", "10")
                        .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(2))
                .andExpect(jsonPath("$.size").value(10))
                .andExpect(jsonPath("$.totalItems").value(11));

        verify(queries).allOrders(null, 1, 10);
    }

    @Test
    void administratorRoleAlsoComesFromUserServiceForTheVerifiedToken() throws Exception {
        org.springframework.security.oauth2.jwt.Jwt caller = org.springframework.security.oauth2.jwt.Jwt
                .withTokenValue("admin-token").header("alg", "RS256").subject("admin").build();
        when(jwtDecoder.decode("admin-token")).thenReturn(caller);
        when(roleProvider.rolesFor(caller)).thenReturn(java.util.Set.of(sg.edu.nus.foc.order.security.Role.ADMIN));
        when(queries.allOrders(null, 0, 20)).thenReturn(new OrderPage(List.of(), 0, 20, 0, 0));

        mockMvc.perform(get("/api/orders").header("Authorization", "Bearer admin-token"))
                .andExpect(status().isOk());

        verify(roleProvider).rolesFor(caller);
    }

    @Test
    void statusFilterIsBoundAndLargePageSizeIsCapped() throws Exception {
        when(queries.allOrders(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyInt()))
                .thenReturn(new OrderPage(List.of(), 0, 100, 0, 0));

        mockMvc.perform(get("/api/orders")
                        .param("status", "COMPLETED")
                        .param("size", "500")
                        .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(100));

        verify(queries).allOrders(org.mockito.ArgumentMatchers.eq(sg.edu.nus.foc.order.domain.OrderStatus.COMPLETED),
                org.mockito.ArgumentMatchers.eq(0), org.mockito.ArgumentMatchers.eq(100));
    }
}
