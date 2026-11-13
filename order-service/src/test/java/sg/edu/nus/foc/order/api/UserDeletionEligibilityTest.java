package sg.edu.nus.foc.order.api;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import sg.edu.nus.foc.order.application.OrderInvolvementService;

class UserDeletionEligibilityTest {
    private final OrderInvolvementService involvement = mock(OrderInvolvementService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new UserDeletionEligibilityController(involvement,
            mock(sg.edu.nus.foc.order.domain.repository.UserDeletionGuard.class))).build();

    @Test
    void activeRequesterOrCourierBlocksDeletionAndNoActiveOrderAllowsIt() throws Exception {
        when(involvement.canDeleteUser("busy")).thenReturn(false);
        when(involvement.canDeleteUser("free")).thenReturn(true);
        mvc.perform(get("/api/orders/internal/users/busy/can-delete"))
                .andExpect(status().isOk()).andExpect(content().string("false"));
        mvc.perform(get("/api/orders/internal/users/free/can-delete"))
                .andExpect(status().isOk()).andExpect(content().string("true"));
    }
}
