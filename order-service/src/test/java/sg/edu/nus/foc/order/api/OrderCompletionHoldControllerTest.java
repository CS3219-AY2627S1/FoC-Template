package sg.edu.nus.foc.order.api;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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
import sg.edu.nus.foc.order.application.OrderCompletionHoldService;
import sg.edu.nus.foc.order.config.ProductionMethodSecurityConfiguration;
import sg.edu.nus.foc.order.config.SecurityConfiguration;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.security.Role;
import sg.edu.nus.foc.order.security.RoleProvider;

@WebMvcTest(controllers = OrderCompletionHoldController.class, properties = "order.reports.creation.enabled=true")
@ActiveProfiles("prod")
@Import({SecurityConfiguration.class, ProductionMethodSecurityConfiguration.class, OrderMapperImpl.class})
class OrderCompletionHoldControllerTest {


    private static final String PATH = "/api/orders/mine/active/order-1/report-holds/report-1";
    private static final String SUBMISSION = "11111111-1111-4111-8111-111111111111";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private OrderCompletionHoldService holds;

    @MockitoBean private sg.edu.nus.foc.order.application.OrderQueryService queries;

    @MockitoBean
    private RoleProvider roles;

    @MockitoBean
    private JwtDecoder decoder;

    @Test void courierModeUsesVerifiedIdentityAndCannotUseRequesterMode() throws Exception {
        when(queries.assignedActiveTo("courier", 1, 20)).thenReturn(
                new sg.edu.nus.foc.order.domain.repository.OrderPage(java.util.List.of(), 0, 20, 0, 0));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/orders/mine/active")
                .with(user("courier").roles("COURIER")).param("mode", "courier").param("userId", "other"))
                .andExpect(status().isOk());
        verify(queries).assignedActiveTo("courier", 1, 20);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/orders/mine/active")
                .with(user("courier").roles("COURIER"))).andExpect(status().isForbidden());
        mvc.perform(put(PATH).with(user("courier").roles("REQUESTER")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requireAssignedCourier\":true,\"reporterRole\":\"COURIER\",\"submissionId\":\""+SUBMISSION+"\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(put(PATH).with(user("courier").roles("COURIER")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requireAssignedCourier\":true,\"reporterRole\":\"ADMIN\",\"submissionId\":\""+SUBMISSION+"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test void participantModeUsesCallerAndRejectsAdminOnlyAccess() throws Exception {
        for (String role : new String[] {"REQUESTER", "COURIER"}) {
            when(queries.participantActive("participant", 1, 20)).thenReturn(
                    new sg.edu.nus.foc.order.domain.repository.OrderPage(java.util.List.of(), 0, 20, 0, 0));
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/orders/mine/active")
                    .with(user("participant").roles(role)).param("mode", "participant").param("userId", "stranger"))
                    .andExpect(status().isOk());
        }
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/orders/mine/active")
                .with(user("admin").roles("ADMIN")).param("mode", "participant"))
                .andExpect(status().isForbidden());
        Order order = Order.open("owner", "books", "p", "d", 5, 30, Instant.now(), Instant.now().plusSeconds(3600));
        order.accept("courier", 0, Instant.now());
        when(holds.placeActive("order-1","report-1",SUBMISSION,"courier",true,null,"PARTICIPANT")).thenReturn(order);
        mvc.perform(put(PATH).with(user("courier").roles("COURIER")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requireAssignedCourier\":true,\"reporterRole\":\"PARTICIPANT\",\"submissionId\":\""+SUBMISSION+"\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.requesterId").value("owner"));
    }

    @Test void courierHoldReturnsActualRequesterAndForwardsCourierScope() throws Exception {
        Order order = Order.open("owner", "books", "p", "d", 5, 30, Instant.now(), Instant.now().plusSeconds(3600));
        order.accept("courier", 0, Instant.now());
        order.placeCourierReportHold("courier");
        when(holds.placeActive("order-1","report-1",SUBMISSION,"courier",true,null,"COURIER")).thenReturn(order);
        mvc.perform(put(PATH).with(user("courier").roles("COURIER")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requireAssignedCourier\":true,\"reporterRole\":\"COURIER\",\"submissionId\":\""+SUBMISSION+"\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.requesterId").value("owner"))
                .andExpect(jsonPath("$.courierId").value("courier"));
    }

    @Test
    void requiresAuthenticationAndRequesterRole() throws Exception {
        mvc.perform(put(PATH).contentType(MediaType.APPLICATION_JSON).content("{\"requireAssignedCourier\":false}"))
                .andExpect(status().isUnauthorized());
        for (String role : new String[] {"COURIER", "ADMIN"}) {
            mvc.perform(put(PATH).with(user("owner").roles(role)).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"requireAssignedCourier\":false}"))
                    .andExpect(status().isForbidden());
        }
    }

    @Test
    void forwardsFirebaseTokenAndUsesTheExplicitBooleanWireName() throws Exception {
        Jwt token = Jwt.withTokenValue("token").header("alg", "RS256").subject("owner").build();
        when(decoder.decode("token")).thenReturn(token);
        when(roles.rolesFor(token)).thenReturn(Set.of(Role.REQUESTER));
        Instant now = Instant.parse("2026-10-14T00:00:00Z");
        Order order = Order.open("owner", "books", "p", "d", 5, 30, now, now.plusSeconds(3600));
        order.placeCompletionHold("owner");
        when(holds.placeActive("order-1","report-1",SUBMISSION,"owner",false,"Bearer token","REQUESTER")).thenReturn(order);

        mvc.perform(put(PATH).header("Authorization", "Bearer token").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requireAssignedCourier\":false,\"submissionId\":\""+SUBMISSION+"\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(order.getId()))
                .andExpect(jsonPath("$.requesterId").value("owner"))
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.reportId").value("report-1"))
                .andExpect(jsonPath("$.isCompletionHold").value(true))
                .andExpect(jsonPath("$.completionHold").doesNotExist());
        verify(holds).placeActive("order-1","report-1",SUBMISSION,"owner",false,"Bearer token","REQUESTER");
    }

    @Test
    void rejectsInvalidPayloadAndHidesOwnerMismatch() throws Exception {
        mvc.perform(put(PATH).with(user("owner").roles("REQUESTER"))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        when(holds.placeActive("order-1","report-1",SUBMISSION,"other",false,null,"REQUESTER"))
                .thenThrow(OrderProblem.notFound("Active order not found."));
        mvc.perform(put(PATH).with(user("other").roles("REQUESTER"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"requireAssignedCourier\":false,\"submissionId\":\""+SUBMISSION+"\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void reportsBindingConflictAndHasNoReleaseOperation() throws Exception {
        when(holds.placeActive("order-1","report-1",SUBMISSION,"owner",false,null,"REQUESTER"))
                .thenThrow(OrderProblem.conflict("The report hold conflicts with an existing placement."));
        mvc.perform(put(PATH).with(user("owner").roles("REQUESTER"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"requireAssignedCourier\":false,\"submissionId\":\""+SUBMISSION+"\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("CONFLICT"));
        mvc.perform(delete(PATH).with(user("owner").roles("REQUESTER")))
                .andExpect(status().isMethodNotAllowed());
    }
    @Test
    void activeRequesterListContractExists() throws Exception {
        when(queries.requestedActiveBy("owner", 1, 20)).thenReturn(new sg.edu.nus.foc.order.domain.repository.OrderPage(java.util.List.of(), 0, 20, 0, 0));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/orders/mine/active")
                .with(user("owner").roles("REQUESTER"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1));
        verify(queries).requestedActiveBy("owner", 1, 20);
    }
    @Test
    void activeListRequiresRequesterAndIgnoresClientIdentityHints() throws Exception {
        var path = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/orders/mine/active");
        mvc.perform(path).andExpect(status().isUnauthorized());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/orders/mine/active")
                .with(user("admin").roles("ADMIN"))).andExpect(status().isForbidden());
        when(queries.requestedActiveBy("owner", 1, 100)).thenReturn(
                new sg.edu.nus.foc.order.domain.repository.OrderPage(java.util.List.of(), 0, 100, 0, 0));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/orders/mine/active")
                .with(user("owner").roles("REQUESTER")).param("userId", "intruder").param("size", "100"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.size").value(100));
        verify(queries).requestedActiveBy("owner", 1, 100);
    }
}
