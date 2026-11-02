/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.security;

import java.io.IOException;
import java.time.Clock;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import sg.edu.nus.foc.reporting.error.ApiError;
import tools.jackson.databind.json.JsonMapper;

public class JsonSecurityHandlers implements AuthenticationEntryPoint, AccessDeniedHandler {
    private final JsonMapper mapper; private final Clock clock;
    JsonSecurityHandlers(JsonMapper mapper, Clock clock) { this.mapper = mapper; this.clock = clock; }
    @Override public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException exception) throws IOException {
        response.setHeader("WWW-Authenticate", "Bearer"); write(response, ApiError.of(401, "UNAUTHENTICATED", "A valid bearer token is required.", request.getRequestURI(), clock.instant()));
    }
    @Override public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException exception) throws IOException {
        write(response, ApiError.of(403, "FORBIDDEN", "Only administrators can access this resource.", request.getRequestURI(), clock.instant()));
    }
    private void write(HttpServletResponse response, ApiError error) throws IOException {
        response.setStatus(error.status()); response.setContentType(MediaType.APPLICATION_JSON_VALUE); mapper.writeValue(response.getOutputStream(), error);
    }
}
