package sg.edu.nus.foc.order.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
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
import sg.edu.nus.foc.order.api.mapper.OrderMapperImpl;
import sg.edu.nus.foc.order.application.LifecycleProcessingService;
import sg.edu.nus.foc.order.application.OrderAssignmentService;
import sg.edu.nus.foc.order.application.OrderCreationService;
import sg.edu.nus.foc.order.application.OrderQueryService;
import sg.edu.nus.foc.order.application.OrderRepostService;
import sg.edu.nus.foc.order.application.OrderTransitionService;
import sg.edu.nus.foc.order.application.UserServicePort;
import sg.edu.nus.foc.order.config.ProductionMethodSecurityConfiguration;
import sg.edu.nus.foc.order.config.SecurityConfiguration;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.security.Role;
import sg.edu.nus.foc.order.security.RoleProvider;

@WebMvcTest(controllers = OrderController.class, properties = "USER_SERVICE_MODE=mock")
@ActiveProfiles("prod")
@Import({SecurityConfiguration.class, ProductionMethodSecurityConfiguration.class, OrderMapperImpl.class})
class OrderControllerRoleSecurityTest {

    private static final String ACTOR_BODY =
            "{\"commandId\":\"command\",\"actorId\":\"u1\",\"expectedVersion\":0}";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private org.springframework.core.env.Environment environment;

    @MockitoBean
    private OrderCreationService creation;

    @MockitoBean
    private OrderAssignmentService assignment;

    @MockitoBean
    private OrderTransitionService transitions;

    @MockitoBean
    private OrderQueryService queries;

    @MockitoBean
    private OrderRepostService reposts;

    @MockitoBean
    private LifecycleProcessingService lifecycle;

    @MockitoBean
    private UserServicePort users;

    @MockitoBean
    private RoleProvider roleProvider;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @MockitoBean private sg.edu.nus.foc.order.application.recovery.OrderCommandService commands;
    @MockitoBean private sg.edu.nus.foc.order.security.OrderReadAccessPolicy readAccess;

    @Test
    void productionDefaultsToHttpRolesIndependentlyOfSharedMockMode() {
        org.junit.jupiter.api.Assertions.assertEquals("http",
                environment.getProperty("order.security.user-service.mode"));
    }

    @Test
    void courierCommandsRejectRequesterAndAdminOnlyRoles() throws Exception {
        for (String action : new String[] {"accept", "start", "pickup", "deliver", "cancel-accepted"}) {
            for (String role : new String[] {"REQUESTER", "ADMIN"}) {
                mockMvc.perform(post("/api/orders/order/" + action)
                                .with(user("u1").roles(role))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(ACTOR_BODY))
                        .andExpect(status().isForbidden());
            }
        }
    }

    @Test
    void requesterCommandsRejectCourierOnlyRole() throws Exception {
        for (String action : new String[] {"complete", "cancel"}) {
            mockMvc.perform(post("/api/orders/order/" + action)
                            .with(user("u1").roles("COURIER"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(ACTOR_BODY))
                    .andExpect(status().isForbidden());
        }
        mockMvc.perform(get("/api/orders/order/repost-draft")
                        .param("actorId", "u1")
                        .with(user("u1").roles("COURIER")))
                .andExpect(status().isForbidden());
    }

    @Test
    void verifiedBearerResolvesFullRoleSetOnceBeforeCourierCommand() throws Exception {
        Jwt caller = Jwt.withTokenValue("token").header("alg", "RS256").subject("u1").build();
        when(jwtDecoder.decode("token")).thenReturn(caller);
        when(roleProvider.rolesFor(caller)).thenReturn(Set.of(Role.REQUESTER, Role.COURIER));
        when(commands.submit(anyString(), any(), anyString())).thenReturn(new sg.edu.nus.foc.order.application.recovery.CommandView(
                "command", "ACCEPT", "COMPLETED", "SUCCESS", "SUCCEEDED", "Done", "order", 1, null,
                new OrderMapperImpl().toResponse(order())));

        mockMvc.perform(post("/api/orders/order/accept")
                        .header("Authorization", "Bearer token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(ACTOR_BODY))
                .andExpect(status().isOk());

        verify(roleProvider).rolesFor(caller);
        verify(commands).submit("command", new sg.edu.nus.foc.order.application.recovery.CommandRequest("ACCEPT", "u1", "order", 0, null), "Bearer token");
    }

    @Test
    void requesterCanCompleteAndAnonymousCannotRunCommands() throws Exception {
        when(transitions.complete(anyString(), anyString(), anyString(), anyLong(), any()))
                .thenReturn(order());
        mockMvc.perform(post("/api/orders/order/complete")
                        .with(user("u1").roles("REQUESTER"))
                        .contentType(MediaType.APPLICATION_JSON).content(ACTOR_BODY))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/orders/order/accept")
                        .contentType(MediaType.APPLICATION_JSON).content(ACTOR_BODY))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void creationAndRepostRequireRequesterRole() throws Exception {
        String createBody = "{\"commandId\":\"command\",\"requesterId\":\"u1\",\"itemDescription\":\"item\","
                + "\"pickupSupplierId\":\"pickup\",\"deliverySupplierId\":\"delivery\",\"offeredCredits\":2,"
                + "\"deliveryTimeLimitMinutes\":15,\"expiresAt\":\"2026-10-09T00:00:00Z\",\"automaticRepost\":false,\"repostCreditAmount\":0,\"repostDeliveryDurationMinutes\":0}";
        String repostBody = "{\"commandId\":\"command\",\"actorId\":\"u1\",\"expectedVersion\":0,"
                + "\"itemDescription\":\"item\",\"offeredCredits\":2,\"deliveryTimeLimitMinutes\":15,"
                + "\"expiresAt\":\"2026-10-09T00:00:00Z\"}";
        String configureBody = "{\"commandId\":\"command\",\"actorId\":\"u1\",\"expectedVersion\":0,"
                + "\"enabled\":false,\"dueAt\":\"2026-10-09T00:00:00Z\",\"creditAmount\":2,\"deliveryDurationMinutes\":15}";
        String[] paths = {"/api/orders", "/api/orders/order/repost", "/api/orders/order/repost/configure"};
        String[] bodies = {createBody, repostBody, configureBody};
        for (int index = 0; index < paths.length; index++) {
            mockMvc.perform(post(paths[index]).with(user("u1").roles("COURIER"))
                            .contentType(MediaType.APPLICATION_JSON).content(bodies[index]))
                    .andExpect(status().isForbidden());
        }
    }

    @Test
    void sharedReadsRejectUnrecognizedRolesAndRoleDependencyFailureIs503() throws Exception {
        mockMvc.perform(get("/api/orders/order").with(user("u1").roles("UNKNOWN")))
                .andExpect(status().isForbidden());
        Jwt caller = Jwt.withTokenValue("token").header("alg", "RS256").subject("u1").build();
        when(jwtDecoder.decode("token")).thenReturn(caller);
        when(roleProvider.rolesFor(caller)).thenThrow(
                new sg.edu.nus.foc.order.security.RoleLookupException("offline", null));
        mockMvc.perform(get("/api/orders/order").header("Authorization", "Bearer token"))
                .andExpect(status().isServiceUnavailable());
    }

    private Order order() {
        Instant now = Instant.parse("2026-10-08T00:00:00Z");
        return Order.open("requester", "item", "pickup", "delivery", 2, 15, now, now.plusSeconds(3600));
    }
}
