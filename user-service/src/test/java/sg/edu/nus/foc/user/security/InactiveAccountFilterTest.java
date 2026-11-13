package sg.edu.nus.foc.user.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import sg.edu.nus.foc.user.model.AccountStatus;
import sg.edu.nus.foc.user.model.User;
import sg.edu.nus.foc.user.repository.UserRepository;

class InactiveAccountFilterTest {
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void oldValidTokenCannotChangeProfileWhileInactive() throws Exception {
        UserRepository repository = mock(UserRepository.class);
        User user = new User(); user.setStatus(AccountStatus.DEACTIVATION_PENDING);
        when(repository.findByUserId("student")).thenReturn(Optional.of(user));
        caller();
        MockHttpServletResponse response = new MockHttpServletResponse();
        new ActiveAccountFilter(repository).doFilter(new MockHttpServletRequest("PUT", "/api/users/me"), response,
                (request, result) -> fail("Inactive caller reached the controller"));
        assertEquals(403, response.getStatus());
    }

    @Test void activeCallerAndRoleContextQueryAreAllowed() throws Exception {
        UserRepository repository = mock(UserRepository.class);
        User user = new User();
        when(repository.findByUserId("student")).thenReturn(Optional.of(user));
        caller();
        MockHttpServletResponse response = new MockHttpServletResponse();
        new ActiveAccountFilter(repository).doFilter(new MockHttpServletRequest("PUT", "/api/users/me"), response,
                (request, result) -> result.getWriter().write("allowed"));
        assertEquals("allowed", response.getContentAsString());
        user.setStatus(AccountStatus.DEACTIVATED);
        MockHttpServletResponse roles = new MockHttpServletResponse();
        new ActiveAccountFilter(repository).doFilter(new MockHttpServletRequest("GET", "/api/users/role-context"), roles,
                (request, result) -> result.getWriter().write("roles-query"));
        assertEquals("roles-query", roles.getContentAsString());
    }

    @Test void dependencyOutageFailsClosedRatherThanAuthorizing() throws Exception {
        UserRepository repository = mock(UserRepository.class);
        when(repository.findByUserId("student")).thenThrow(new IllegalStateException("offline"));
        caller();
        MockHttpServletResponse response = new MockHttpServletResponse();
        new ActiveAccountFilter(repository).doFilter(new MockHttpServletRequest("GET", "/api/users/me"), response,
                (request, result) -> fail("Dependency failure authorized a caller"));
        assertEquals(503, response.getStatus());
    }

    private void caller() {
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(
                Jwt.withTokenValue("test-token").header("alg", "RS256").subject("student").build()));
    }
}
