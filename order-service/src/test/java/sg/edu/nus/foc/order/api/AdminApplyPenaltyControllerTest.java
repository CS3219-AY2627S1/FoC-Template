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
class AdminApplyPenaltyControllerTest {
    @Autowired private MockMvc mvc;
    @MockitoBean private OrderQueryService queries;
    @MockitoBean private AdminOrderCancellationService cancellations;
    @MockitoBean private sg.edu.nus.foc.order.application.AdminApplyPenaltyService penalties;
    @MockitoBean private sg.edu.nus.foc.order.application.OrderCompletionHoldService holds;
    @MockitoBean private JwtDecoder decoder;
    @MockitoBean private RoleProvider roles;
    private static final String PATH="/api/orders/admin/order-1/apply-penalty";
    private static final String BODY="{\"commandId\":\"cmd\",\"courierId\":\"courier\",\"expectedVersion\":0,\"policy\":\"WRONG_LOCATION_DELIVERY\",\"reason\":\"Wrong location\"}";
    @Test void requiresAdministratorAndForwardsVerifiedIdentity() throws Exception {
        mvc.perform(post(PATH).contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isUnauthorized());
        mvc.perform(post(PATH).with(user("courier").roles("COURIER")).contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isForbidden());
        mvc.perform(post(PATH).with(user("admin").roles("ADMIN")).contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isOk());
        verify(penalties).apply("cmd","order-1","courier",0,PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,"Wrong location","admin");
    }
    @Test void invalidBodyIsRejectedAndOldRoutesAreGone() throws Exception {
        mvc.perform(post(PATH).with(user("admin").roles("ADMIN")).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/orders/admin/order-1/complete").with(user("admin").roles("ADMIN")).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNotFound());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/orders/admin/order-1/penalties/00000000-0000-0000-0000-000000000001").with(user("admin").roles("ADMIN")).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNotFound());
    }
    @Test void reportHoldReleaseStillRequiresAdministratorAndUsesVerifiedIdentity() throws Exception {
        String path="/api/orders/admin/order-1/completion-holds/report-1/release";
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(path)).andExpect(status().isUnauthorized());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(path).with(user("courier").roles("COURIER"))).andExpect(status().isForbidden());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(path).with(user("admin").roles("ADMIN"))).andExpect(status().isOk());
        verify(holds).release("order-1","report-1","admin");
    }

}
