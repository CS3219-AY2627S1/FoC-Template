package sg.edu.nus.foc.order.api;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import sg.edu.nus.foc.order.application.recovery.OrderCommandService;
import sg.edu.nus.foc.order.config.*;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.security.RoleProvider;

@WebMvcTest(OrderCommandController.class)
@ActiveProfiles("prod")
@Import({SecurityConfiguration.class, ProductionMethodSecurityConfiguration.class})
class OrderCommandSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean OrderCommandService commands;
    @MockitoBean RoleProvider roles;
    @MockitoBean JwtDecoder decoder;
    private static final String BODY = "{\"commandId\":\"K\",\"actorId\":\"u\",\"expectedVersion\":0}";
    @Test void missingAuthenticationAndWrongRoleNeverExecute() throws Exception {
        mvc.perform(get("/api/orders/commands/capabilities")).andExpect(status().isUnauthorized());
        for (String action : new String[] {"accept", "abort"}) {
            for (String role : new String[] {"REQUESTER", "ADMIN"}) {
                mvc.perform(post("/api/orders/commands/order/" + action).with(user("u").roles(role))
                    .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isForbidden());
            }
        }
        verifyNoInteractions(commands);
    }
    @Test void requesterCreationCannotBeInvokedByAdminOrCourier() throws Exception {
        String body = "{\"commandId\":\"K\",\"requesterId\":\"u\",\"itemDescription\":\"item\",\"pickupSupplierId\":\"p\",\"deliverySupplierId\":\"d\",\"offeredCredits\":1,\"deliveryTimeLimitMinutes\":15,\"expiresAt\":\"2030-01-01T00:00:00Z\",\"automaticRepost\":false,\"repostCreditAmount\":0,\"repostDeliveryDurationMinutes\":0}";
        for (String role : new String[] {"ADMIN", "COURIER"}) {
            mvc.perform(post("/api/orders/commands/create").with(user("u").roles(role))
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        }
        verifyNoInteractions(commands);
    }
    @Test void anotherOwnersStatusAndResumeAreForbidden() throws Exception {
        when(commands.status(eq("K"), eq("other"), any())).thenThrow(OrderProblem.forbidden("Owner mismatch"));
        when(commands.resume(eq("K"), eq("other"), any())).thenThrow(OrderProblem.forbidden("Owner mismatch"));
        mvc.perform(get("/api/orders/commands/K?userId=other").with(user("u").roles("REQUESTER"))).andExpect(status().isForbidden());
        mvc.perform(post("/api/orders/commands/K/resume?userId=other").with(user("u").roles("REQUESTER"))).andExpect(status().isForbidden());
    }
    @Test void manualRepostRequiresRequesterAndBoundsCommandIdentity() throws Exception {
        String body = "{\"commandId\":\"R\",\"actorId\":\"u\",\"expectedVersion\":0,\"itemDescription\":\"task\","
                + "\"offeredCredits\":5,\"deliveryTimeLimitMinutes\":15,\"expiresAt\":\"2030-01-01T00:00:00Z\"}";
        mvc.perform(post("/api/orders/commands/original/repost").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        for (String role : new String[] {"ADMIN", "COURIER"}) {
            mvc.perform(post("/api/orders/commands/original/repost").with(user("u").roles(role))
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        }
        mvc.perform(post("/api/orders/commands/original/repost").with(user("u").roles("REQUESTER"))
                .contentType(MediaType.APPLICATION_JSON).content(body.replace("\"R\"", "\"" + "x".repeat(129) + "\"")))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(commands);
    }
}
