package sg.edu.nus.foc.order.api;

import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import sg.edu.nus.foc.order.api.mapper.OrderInvolvementMapperImpl;
import sg.edu.nus.foc.order.application.OrderInvolvementService;
import sg.edu.nus.foc.order.config.ProductionMethodSecurityConfiguration;
import sg.edu.nus.foc.order.config.SecurityConfiguration;
import sg.edu.nus.foc.order.domain.ActiveOrderInvolvement;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.security.RoleProvider;

@WebMvcTest(controllers = OrderInvolvementController.class)
@ActiveProfiles("prod")
@Import({SecurityConfiguration.class, ProductionMethodSecurityConfiguration.class, OrderInvolvementMapperImpl.class})
class OrderInvolvementControllerTest {

    @Autowired private MockMvc mvc;
    @MockitoBean private OrderInvolvementService involvement;
    @MockitoBean private RoleProvider roles;
    @MockitoBean private JwtDecoder decoder;

    @Test
    void bothEndpointsAllowAllThreeRolesAndExposeOnlyIdAndBoolean() throws Exception {
        when(involvement.user("target")).thenReturn(new ActiveOrderInvolvement("target", true));
        when(involvement.supplier("place")).thenReturn(new ActiveOrderInvolvement("place", false));
        for (String role : new String[] {"REQUESTER", "COURIER", "ADMIN"}) {
            mvc.perform(get("/api/orders/users/target/active-involvement").with(user("caller").roles(role)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.userId").value("target"))
                    .andExpect(jsonPath("$.hasActiveOrders").value(true)).andExpect(jsonPath("$.length()").value(2));
            mvc.perform(get("/api/orders/suppliers/place/active-involvement").with(user("caller").roles(role)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.supplierId").value("place"))
                    .andExpect(jsonPath("$.hasActiveOrders").value(false)).andExpect(jsonPath("$.length()").value(2));
        }
    }

    @Test
    void productionRejectsAnonymousAndUnrecognizedRoles() throws Exception {
        for (String path : new String[] {"users/target", "suppliers/place"}) {
            mvc.perform(get("/api/orders/" + path + "/active-involvement")).andExpect(status().isUnauthorized());
            mvc.perform(get("/api/orders/" + path + "/active-involvement").with(user("caller").roles("OTHER")))
                    .andExpect(status().isForbidden());
        }
    }

    @Test
    void invalidIdUsesExistingErrorEnvelope() throws Exception {
        when(involvement.user("bad")).thenThrow(new OrderProblem("VALIDATION_ERROR", "Invalid ID"));
        mvc.perform(get("/api/orders/users/bad/active-involvement").with(user("caller").roles("REQUESTER")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("VALIDATION_ERROR"));
    }
}
