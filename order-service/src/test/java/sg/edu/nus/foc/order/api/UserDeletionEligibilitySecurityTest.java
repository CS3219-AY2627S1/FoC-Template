package sg.edu.nus.foc.order.api;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import sg.edu.nus.foc.order.application.OrderInvolvementService;
import sg.edu.nus.foc.order.config.SecurityConfiguration;
import sg.edu.nus.foc.order.security.RoleProvider;

@WebMvcTest(controllers = UserDeletionEligibilityController.class,
        properties = {"FOC_INTERNAL_ORDER_API_ENABLED=true", "FOC_ENVIRONMENT=production"})
@ActiveProfiles("prod")
@Import(SecurityConfiguration.class)
class UserDeletionEligibilitySecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean OrderInvolvementService involvement;
    @MockitoBean sg.edu.nus.foc.order.domain.repository.UserDeletionGuard deletionGuard;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean RoleProvider roles;

    @Test void onlyTheExactPrivateQueryAndPreparationAreAvailableWithoutJwt() throws Exception {
        when(involvement.canDeleteUser("U")).thenReturn(true);
        mvc.perform(get("/api/orders/internal/users/U/can-delete"))
                .andExpect(status().isOk()).andExpect(content().string("true"));
        verify(involvement).canDeleteUser("U");
        when(deletionGuard.prepare("U", "saved-operation")).thenReturn(true);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(
                        "/api/orders/internal/users/U/deletion-preparations/saved-operation"))
                .andExpect(status().isOk()).andExpect(content().string("true"));
        verify(deletionGuard).prepare("U", "saved-operation");
        verifyNoInteractions(roles, decoder);
    }

    @Test void ordinaryAndOtherInternalRequestsStillNeedAuthentication() throws Exception {
        mvc.perform(get("/api/orders/mine")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/orders/internal/users/U/other")).andExpect(status().isUnauthorized());
        verifyNoInteractions(involvement);
    }
}
