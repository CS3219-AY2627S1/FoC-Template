package com.friendoncampus.order.web.error;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Renders Spring Security 401/403 outcomes as RFC-7807 {@code application/problem+json}, matching
 * the shape produced by {@link ApiExceptionHandler} for the rest of the API. These failures occur
 * in the security filter chain, before the {@code @RestControllerAdvice} can see them, so they are
 * handled here instead.
 *
 * <p>The body is written directly rather than through a Jackson {@code ObjectMapper}: the security
 * filter has no message converters, and Spring Boot 4 no longer exposes a Jackson-2 ObjectMapper
 * bean. The title/detail values are fixed constants, so a small hand-written document is safe.
 */
@Component
public class ProblemSecurityHandler implements AuthenticationEntryPoint, AccessDeniedHandler {

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException authException) throws IOException {
        response.setHeader("WWW-Authenticate", "Bearer");
        writeProblem(response, HttpStatus.UNAUTHORIZED, "Authentication required",
                "A valid User Service bearer token is required to access this resource");
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
            AccessDeniedException accessDeniedException) throws IOException {
        writeProblem(response, HttpStatus.FORBIDDEN, "Access denied",
                "Your current session role is not permitted to perform this action");
    }

    private void writeProblem(HttpServletResponse response, HttpStatus status, String title, String detail)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        String body = "{\"type\":\"about:blank\","
                + "\"title\":\"" + escape(title) + "\","
                + "\"status\":" + status.value() + ","
                + "\"detail\":\"" + escape(detail) + "\"}";
        response.getWriter().write(body);
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
