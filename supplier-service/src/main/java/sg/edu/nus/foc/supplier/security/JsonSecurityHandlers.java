package sg.edu.nus.foc.supplier.security;

import java.io.IOException;
import java.time.Clock;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import sg.edu.nus.foc.supplier.error.ApiError;
import sg.edu.nus.foc.supplier.error.ErrorCode;
import sg.edu.nus.foc.supplier.error.SecurityMessages;
import tools.jackson.databind.json.JsonMapper;

/** Writes 401/403 from the security filter chain in the shared JSON error envelope. */
public class JsonSecurityHandlers implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final JsonMapper mapper;
    private final Clock clock;

    public JsonSecurityHandlers(JsonMapper mapper, Clock clock) {
        this.mapper = mapper;
        this.clock = clock;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex)
            throws IOException {
        // RFC 6750: tell clients a bearer token is expected.
        response.setHeader("WWW-Authenticate", "Bearer");
        write(response, ApiError.of(ErrorCode.UNAUTHENTICATED, SecurityMessages.UNAUTHENTICATED,
                request.getRequestURI(), clock.instant()));
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex)
            throws IOException {
        write(response, ApiError.of(ErrorCode.FORBIDDEN, SecurityMessages.forbidden(request),
                request.getRequestURI(), clock.instant()));
    }

    private void write(HttpServletResponse response, ApiError body) throws IOException {
        response.setStatus(body.status());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(), body);
    }
}
