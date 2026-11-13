package sg.edu.nus.foc.order.security;

import java.io.IOException;
import java.time.Instant;
import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.AuthenticationEntryPoint;
import tools.jackson.databind.json.JsonMapper;

import sg.edu.nus.foc.order.api.dto.response.ErrorDetailResponse;
import sg.edu.nus.foc.order.api.dto.response.ErrorResponse;

/** Writes JSON 401/403 responses and fail-closed 503 role-provider failures. */
@RequiredArgsConstructor
public class JsonSecurityHandlers implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final JsonMapper mapper;

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
            throws IOException {
        boolean roleLookupFailure = exception instanceof AuthenticationServiceException
                && exception.getCause() instanceof RoleLookupException;
        int status = roleLookupFailure ? 503 : 401;
        String code = roleLookupFailure ? "SERVICE_UNAVAILABLE" : "UNAUTHENTICATED";
        String message = roleLookupFailure
                ? "User Service role lookup is unavailable."
                : "Authentication is required.";
        if (!roleLookupFailure) {
            response.setHeader("WWW-Authenticate", "Bearer");
        }
        write(response, new ErrorResponse(status, code, message, request.getRequestURI(), Instant.now(), List.of()));
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException exception)
            throws IOException {
        write(response, new ErrorResponse(
                403,
                "FORBIDDEN",
                "The required role is missing.",
                request.getRequestURI(),
                Instant.now(),
                List.<ErrorDetailResponse>of()));
    }

    private void write(HttpServletResponse response, ErrorResponse body) throws IOException {
        response.setStatus(body.getStatus());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(), body);
    }
}
