package sg.edu.nus.foc.order.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import sg.edu.nus.foc.order.application.OrderOutboxAfterCommitListener;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.order.security.RoleProvider;
import sg.edu.nus.foc.order.config.SecurityConfiguration;
import sg.edu.nus.foc.order.config.ProductionMethodSecurityConfiguration;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.mockito.Mockito.*;

@WebMvcTest(OrderOutboxAdminController.class)
@ActiveProfiles("prod")
@Import({SecurityConfiguration.class, ProductionMethodSecurityConfiguration.class})
class OrderOutboxAdminSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean OrderEventOutboxRepository outbox;
    @MockitoBean OrderOutboxAfterCommitListener publication;
    @MockitoBean RoleProvider roles;
    @MockitoBean JwtDecoder decoder;

    @Test void onlyAdminsCanInspectAndRedrive() throws Exception {
        mvc.perform(get("/api/orders/internal/outbox/failed")).andExpect(status().isUnauthorized());
        for (String role : new String[]{"REQUESTER", "COURIER"}) {
            mvc.perform(get("/api/orders/internal/outbox/failed").with(user("u").roles(role))).andExpect(status().isForbidden());
            mvc.perform(post("/api/orders/internal/outbox/event/redrive").with(user("u").roles(role))).andExpect(status().isForbidden());
        }
        verifyNoInteractions(outbox, publication);
        mvc.perform(get("/api/orders/internal/outbox/failed").with(user("admin").roles("ADMIN"))).andExpect(status().isOk());
        mvc.perform(post("/api/orders/internal/outbox/event/redrive").with(user("admin").roles("ADMIN"))).andExpect(status().isAccepted());
        verify(outbox).redrive(eq("event"), any());
    }
}
