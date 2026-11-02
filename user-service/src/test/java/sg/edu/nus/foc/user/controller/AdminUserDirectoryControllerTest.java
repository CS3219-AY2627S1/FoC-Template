package sg.edu.nus.foc.user.controller;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;
import sg.edu.nus.foc.user.security.SecurityConfig;
import sg.edu.nus.foc.user.config.UserPushProperties;
import sg.edu.nus.foc.user.logic.AdminUserDirectory;
import sg.edu.nus.foc.user.logic.AdminUserPage;
import sg.edu.nus.foc.user.model.AccountStatus;
import sg.edu.nus.foc.user.model.User;
import sg.edu.nus.foc.user.repository.UserRepository;
import sg.edu.nus.foc.user.security.CallerRoles;
import sg.edu.nus.foc.user.security.MongoUserServiceRoleProvider;

@WebMvcTest(controllers = AdminUserDirectoryController.class)
@Import({SecurityConfig.class, CallerRoles.class, MongoUserServiceRoleProvider.class, AdminUserDirectoryControllerTest.WebSecurityForSlice.class})
class AdminUserDirectoryControllerTest {
    @TestConfiguration(proxyBeanMethods = false)
    @EnableConfigurationProperties(UserPushProperties.class)
    @EnableWebSecurity
    static class WebSecurityForSlice { }
    @Autowired MockMvc mvc;
    @MockitoBean AdminUserDirectory directory;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean UserRepository users;
    private User caller;

    @BeforeEach void caller() {
        caller = new User(); caller.setUserId("admin"); caller.setRoles(List.of("admin"));
        when(users.findByUserId("admin")).thenReturn(Optional.of(caller));
        when(decoder.decode("valid")).thenReturn(Jwt.withTokenValue("valid").header("alg", "RS256").subject("admin").build());
    }

    @Test void activeAdminGetsTheInitialPageWithSafeDisplayFields() throws Exception {
        when(directory.search(1, 20, "id", "")).thenReturn(new AdminUserPage(List.of(AdminUserPage.Item.from(caller)), 1, 20, 1, 1));
        mvc.perform(get("/api/users/admin/search").header("Authorization", "Bearer valid"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.items[0].userId").value("admin"))
                .andExpect(jsonPath("$.items[0].isCourierSuspended").value(false))
                .andExpect(jsonPath("$.items[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$.items[0].deletionOperationId").doesNotExist())
                .andExpect(jsonPath("$.items[0].usableBalance").doesNotExist());
    }

    @Test void authenticationAndRealAdminRoleAreRequired() throws Exception {
        mvc.perform(get("/api/users/admin/search")).andExpect(status().isUnauthorized());
        caller.setRoles(List.of("requester", "courier"));
        mvc.perform(get("/api/users/admin/search").header("Authorization", "Bearer valid"))
                .andExpect(status().isForbidden());
        caller.setRoles(List.of("admin")); caller.setStatus(AccountStatus.DEACTIVATED);
        mvc.perform(get("/api/users/admin/search").header("Authorization", "Bearer valid"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(directory);
    }

    @Test void badQueriesAndDatabaseFailuresReturnControlledErrors() throws Exception {
        when(directory.search(0, 20, "id", "")).thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid page"));
        mvc.perform(get("/api/users/admin/search").param("page", "0").header("Authorization", "Bearer valid"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/users/admin/search").param("page", "oops").header("Authorization", "Bearer valid"))
                .andExpect(status().isBadRequest());
        when(directory.search(1, 20, "name", "Alex")).thenThrow(new DataAccessResourceFailureException("private database details"));
        mvc.perform(get("/api/users/admin/search").param("searchBy", "name").param("q", "Alex").header("Authorization", "Bearer valid"))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.error").value("SERVICE_UNAVAILABLE"))
                .andExpect(jsonPath("$.message").value("User directory could not be loaded. Please retry."));
    }
}
