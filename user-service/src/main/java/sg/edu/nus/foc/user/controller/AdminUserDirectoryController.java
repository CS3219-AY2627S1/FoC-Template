package sg.edu.nus.foc.user.controller;

import java.time.Instant;
import java.util.List;
import jakarta.servlet.http.HttpServletRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;
import sg.edu.nus.foc.user.logic.AdminUserDirectory;
import sg.edu.nus.foc.user.logic.AdminUserPage;

@RestController
@RequestMapping("/api/users/admin/search")
@SecurityScheme(name = "bearerAuth", type = SecuritySchemeType.HTTP, scheme = "bearer", bearerFormat = "JWT")
@SecurityRequirement(name = "bearerAuth")
public class AdminUserDirectoryController {
    private final AdminUserDirectory directory;

    public AdminUserDirectoryController(AdminUserDirectory directory) { this.directory = directory; }

    @GetMapping
    @PreAuthorize("@callerRoles.isAdmin(authentication)")
    @Operation(summary = "List and search users for administrators", description = "Empty q returns the initial directory page. ID search is exact Firebase userId; name search is a case-insensitive literal username substring. Includes all account statuses. MongoDB filters/counts/pages, sorted by username, userId then document ID ascending. No lifecycle recovery data or Credit balances.")
    @ApiResponse(responseCode = "200", description = "One-based User page; no matches returns an empty items array")
    @ApiResponse(responseCode = "400", description = "Invalid pagination, search category or query")
    @ApiResponse(responseCode = "401", description = "Missing or invalid Firebase ID token")
    @ApiResponse(responseCode = "403", description = "Active administrator required")
    @ApiResponse(responseCode = "503", description = "Account authorization or directory database unavailable")
    public AdminUserPage search(
            @Parameter(description = "One-based page") @RequestParam(defaultValue = "1") int page,
            @Parameter(description = "Page size from 1 to 100") @RequestParam(defaultValue = "20") int size,
            @Parameter(description = "id or name") @RequestParam(defaultValue = "id") String searchBy,
            @Parameter(description = "Trimmed search text, at most 128 characters; blank lists users") @RequestParam(defaultValue = "") String q) {
        return directory.search(page, size, searchBy, q);
    }

    @ExceptionHandler({ResponseStatusException.class, MethodArgumentTypeMismatchException.class,
            DataAccessException.class, AccessDeniedException.class})
    ResponseEntity<DirectoryError> failure(Exception error, HttpServletRequest request) {
        int status = error instanceof DataAccessException ? 503 : error instanceof AccessDeniedException ? 403
                : error instanceof ResponseStatusException response ? response.getStatusCode().value() : 400;
        String code = status == 503 ? "SERVICE_UNAVAILABLE" : status == 403 ? "FORBIDDEN" : "VALIDATION_ERROR";
        String message = status == 503 ? "User directory could not be loaded. Please retry."
                : status == 403 ? "Only administrators can search users."
                : error instanceof ResponseStatusException response ? response.getReason() : "Invalid directory query parameter.";
        return ResponseEntity.status(status).body(new DirectoryError(status, code, message,
                request.getRequestURI(), Instant.now(), List.of()));
    }

    public record DirectoryError(int status, String error, String message, String path, Instant timestamp, List<Object> details) { }
}
