/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Code generation.
 * Scope: Generated the security implementation from the team-finalized Firebase authentication, authorization, and CORS design.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.security;

import java.io.IOException;
import java.time.Clock;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import sg.edu.nus.foc.credit.error.ApiError;
import sg.edu.nus.foc.credit.error.ErrorCode;
import sg.edu.nus.foc.credit.error.SecurityMessages;
import tools.jackson.databind.json.JsonMapper;

public class JsonSecurityHandlers implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final JsonMapper mapper;
    private final Clock clock;

    public JsonSecurityHandlers(JsonMapper mapper, Clock clock) {
        this.mapper = mapper;
        this.clock = clock;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
            throws IOException {
        boolean roleLookupFailure = exception instanceof AuthenticationServiceException
                && exception.getCause() instanceof RoleLookupException;
        if (roleLookupFailure) {
            write(response, ApiError.of(ErrorCode.SERVICE_UNAVAILABLE, SecurityMessages.ROLE_LOOKUP_UNAVAILABLE,
                    request.getRequestURI(), clock.instant()));
        } else {
            response.setHeader("WWW-Authenticate", "Bearer");
            write(response, ApiError.of(ErrorCode.UNAUTHENTICATED, SecurityMessages.UNAUTHENTICATED,
                    request.getRequestURI(), clock.instant()));
        }
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException exception)
            throws IOException {
        write(response, ApiError.of(ErrorCode.FORBIDDEN, SecurityMessages.FORBIDDEN,
                request.getRequestURI(), clock.instant()));
    }

    private void write(HttpServletResponse response, ApiError body) throws IOException {
        response.setStatus(body.status());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(), body);
    }
}
