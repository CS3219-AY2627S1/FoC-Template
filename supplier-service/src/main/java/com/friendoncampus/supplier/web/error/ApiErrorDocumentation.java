package com.friendoncampus.supplier.web.error;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Schema-only models for documenting the Problem Details responses emitted by
 * {@link ApiExceptionHandler}. Runtime responses continue to use Spring's
 * {@code ProblemDetail} type.
 */
public final class ApiErrorDocumentation {

    private ApiErrorDocumentation() {
    }

    @Schema(name = "InvalidRequestProblem", description = "Problem Details response for an invalid query or supplier ID")
    public record InvalidRequest(
            @Schema(example = "about:blank") String type,
            @Schema(example = "Invalid supplier query") String title,
            @Schema(example = "400") int status,
            @Schema(example = "Page must be a nonnegative whole number") String detail,
            @Schema(example = "/api/suppliers") String instance) {
    }

    @Schema(name = "InvalidSupplierRequestProblem", description = "Problem Details response for an invalid supplier request body")
    public record InvalidSupplierRequest(
            @Schema(example = "about:blank") String type,
            @Schema(example = "Invalid supplier request") String title,
            @Schema(example = "400") int status,
            @Schema(example = "One or more supplier fields are invalid") String detail,
            @Schema(example = "/api/suppliers") String instance,
            @Schema(description = "Validation messages grouped by JSON field; absent for malformed JSON")
            Map<String, List<String>> errors) {
    }

    @Schema(name = "SupplierNotFoundProblem", description = "Problem Details response when a supplier does not exist")
    public record SupplierNotFound(
            @Schema(example = "about:blank") String type,
            @Schema(example = "Supplier not found") String title,
            @Schema(example = "404") int status,
            @Schema(example = "Supplier with ID ca9bd61f-93da-4500-9e9d-48de1bea52fa was not found") String detail,
            @Schema(example = "/api/suppliers/ca9bd61f-93da-4500-9e9d-48de1bea52fa") String instance,
            @Schema(format = "uuid", example = "ca9bd61f-93da-4500-9e9d-48de1bea52fa") UUID supplierId) {
    }

    @Schema(name = "SupplierUpdateConflictProblem", description = "Problem Details response when the requested version is stale")
    public record SupplierUpdateConflict(
            @Schema(example = "about:blank") String type,
            @Schema(example = "Supplier update conflict") String title,
            @Schema(example = "409") int status,
            @Schema(example = "Supplier has changed since the requested version") String detail,
            @Schema(example = "/api/suppliers/ca9bd61f-93da-4500-9e9d-48de1bea52fa") String instance,
            @Schema(format = "uuid", example = "ca9bd61f-93da-4500-9e9d-48de1bea52fa") UUID supplierId,
            @Schema(format = "int64", example = "0", minimum = "0") long requestedVersion,
            @Schema(format = "int64", example = "1", minimum = "0", nullable = true) Long currentVersion) {
    }

    @Schema(name = "InvalidSupplierImageProblem", description = "Problem Details response for an invalid image upload")
    public record InvalidSupplierImage(
            @Schema(example = "about:blank") String type,
            @Schema(example = "Invalid supplier image") String title,
            @Schema(example = "400") int status,
            @Schema(example = "Image must be a JPEG, PNG, or WebP file") String detail,
            @Schema(example = "/api/admin/suppliers/ca9bd61f-93da-4500-9e9d-48de1bea52fa/image") String instance) {
    }

    @Schema(name = "SupplierImageUnavailableProblem", description = "Problem Details response when private image storage is unavailable")
    public record SupplierImageUnavailable(
            @Schema(example = "about:blank") String type,
            @Schema(example = "Supplier image unavailable") String title,
            @Schema(example = "503") int status,
            @Schema(example = "The supplier image is temporarily unavailable") String detail,
            @Schema(example = "/api/suppliers/ca9bd61f-93da-4500-9e9d-48de1bea52fa/image") String instance) {
    }

    @Schema(name = "UnauthorizedProblem", description = "Problem Details response when a valid bearer token is absent")
    public record Unauthorized(
            @Schema(example = "about:blank") String type,
            @Schema(example = "Unauthorized") String title,
            @Schema(example = "401") int status,
            @Schema(example = "A valid bearer token is required") String detail,
            @Schema(example = "/api/admin/suppliers") String instance) {
    }

    @Schema(name = "ForbiddenProblem", description = "Problem Details response when the authenticated user is not an administrator")
    public record Forbidden(
            @Schema(example = "about:blank") String type,
            @Schema(example = "Forbidden") String title,
            @Schema(example = "403") int status,
            @Schema(example = "Administrator access is required") String detail,
            @Schema(example = "/api/admin/suppliers") String instance) {
    }
}
