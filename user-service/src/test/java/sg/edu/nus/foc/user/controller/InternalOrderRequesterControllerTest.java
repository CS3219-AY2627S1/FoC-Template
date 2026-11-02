package sg.edu.nus.foc.user.controller;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;
import sg.edu.nus.foc.user.config.InternalOrderSecurityConfiguration;
import sg.edu.nus.foc.user.config.UserPushProperties;
import sg.edu.nus.foc.user.security.SecurityConfig;
import sg.edu.nus.foc.user.logic.UserService;
import sg.edu.nus.foc.user.model.User;
import sg.edu.nus.foc.user.model.AccountStatus;

@WebMvcTest(controllers = InternalOrderRequesterController.class,
        properties = {"FOC_INTERNAL_ORDER_API_ENABLED=true", "FOC_ENVIRONMENT=staging"})
@EnableConfigurationProperties(UserPushProperties.class)
@Import({InternalOrderSecurityConfiguration.class, SecurityConfig.class})
class InternalOrderRequesterControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean UserService users;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean sg.edu.nus.foc.user.repository.UserRepository repository;

    @Test void requesterRoleIsCheckedWithoutJwtAndAdminOnlyIsNotARequester() throws Exception {
        User requester = new User(); requester.setUserId("u"); requester.setRoles(List.of("requester", "courier"));
        when(users.getUserByUserId("u")).thenReturn(requester);
        mvc.perform(get("/api/users/internal/order-requesters/u")).andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value("u")).andExpect(jsonPath("$.eligible").value(true));
        requester.setRoles(List.of("admin"));
        mvc.perform(get("/api/users/internal/order-requesters/u")).andExpect(status().isOk())
                .andExpect(jsonPath("$.eligible").value(false));
        verifyNoInteractions(decoder);
    }

    @Test void missingAndMalformedUsersCannotBeApproved() throws Exception {
        when(users.getUserByUserId("gone")).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));
        mvc.perform(get("/api/users/internal/order-requesters/gone")).andExpect(status().isNotFound());
        mvc.perform(get("/api/users/internal/order-requesters/" + "x".repeat(129))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/users/me")).andExpect(status().isUnauthorized());
    }

    @Test void pendingAndDeactivatedRequestersCannotAutomaticallyRepost() throws Exception {
        for (AccountStatus status : List.of(AccountStatus.DEACTIVATION_PENDING, AccountStatus.DEACTIVATED)) {
            User requester = new User();
            requester.setUserId("u");
            requester.setRoles(List.of("requester"));
            requester.setStatus(status);
            when(users.getUserByUserId("u")).thenReturn(requester);
            mvc.perform(get("/api/users/internal/order-requesters/u"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.eligible").value(false));
        }
    }
}
