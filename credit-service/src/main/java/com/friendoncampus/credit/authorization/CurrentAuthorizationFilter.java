package com.friendoncampus.credit.authorization;
import java.io.IOException;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.server.ResponseStatusException;

/** After local bearer validation, before controllers open transactions. */
public final class CurrentAuthorizationFilter extends OncePerRequestFilter {
    private final CurrentAuthorization current;
    public CurrentAuthorizationFilter(CurrentAuthorization current) { this.current=current; }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)
            throws ServletException,IOException {
        var auth=SecurityContextHolder.getContext().getAuthentication();
        if(auth instanceof JwtAuthenticationToken token && protectedPath(request)) {
            try { current.require(token.getToken()); }
            catch(ResponseStatusException ex) {
                int status=ex.getStatusCode().value();
                org.slf4j.LoggerFactory.getLogger(CurrentAuthorizationFilter.class).warn("Current authorization rejected request: status={}",status);
                response.setStatus(status);
                response.setHeader("Cache-Control","no-store");
                response.setContentType("application/problem+json");
                response.getWriter().write("{\"status\":"+status+",\"detail\":\"Current account authorization denied or unavailable\"}");
                return;
            }
        }
        chain.doFilter(request,response);
    }
    private boolean protectedPath(HttpServletRequest request) {
        String path=request.getServletPath();
        if(path.isEmpty()) path=request.getRequestURI().substring(request.getContextPath().length());
        return path.startsWith("/api/credits/");
    }
}
