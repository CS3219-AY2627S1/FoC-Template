package sg.edu.nus.foc.user.security;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;
import sg.edu.nus.foc.user.model.AccountStatus;
import sg.edu.nus.foc.user.repository.UserRepository;
import tools.jackson.databind.json.JsonMapper;

/** A signed JWT is identity, not permission for a pending/deactivated account. */
public class ActiveAccountFilter extends OncePerRequestFilter {
    private final UserRepository users;

    public ActiveAccountFilter(UserRepository users) {
        this.users = users;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        boolean eligibilityQuery = "GET".equals(request.getMethod()) && List.of("/api/users/role-context",
                "/api/users/requester-eligibility", "/api/users/courier-eligibility", "/api/users/admin-eligibility").contains(path);
        boolean registration = "POST".equals(request.getMethod()) && "/api/users".equals(path);
        if (!eligibilityQuery && !registration && path.startsWith("/api/users")
                && SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken caller) {
            boolean active;
            try {
                active = users.findByUserId(caller.getToken().getSubject())
                        .filter(user -> user.getStatus() == AccountStatus.ACTIVE).isPresent();
            } catch (RuntimeException unavailable) {
                reject(response, path, 503, "SERVICE_UNAVAILABLE", "Account authorization could not be confirmed.");
                return;
            }
            if (!active) {
                reject(response, path, 403, "FORBIDDEN", "Account is not active.");
                return;
            }
        }
        chain.doFilter(request, response);
    }

    private void reject(HttpServletResponse response, String path, int status, String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write(JsonMapper.builder().build().writeValueAsString(Map.of(
                "status", status, "error", code, "message", message, "path", path,
                "timestamp", Instant.now().toString(), "details", List.of())));
    }
}
