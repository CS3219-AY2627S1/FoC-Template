package com.friendoncampus.supplier.web;

import java.net.URI;
import java.time.Duration;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.supplier.service.DeleteSupplierCommand;
import com.friendoncampus.supplier.service.SupplierQuery;
import com.friendoncampus.supplier.service.SupplierImageService;
import com.friendoncampus.supplier.service.SupplierService;
import com.friendoncampus.supplier.web.dto.ChangeSupplierStatusRequest;
import com.friendoncampus.supplier.web.dto.CreateSupplierRequest;
import com.friendoncampus.supplier.web.dto.SupplierListResponse;
import com.friendoncampus.supplier.web.dto.SupplierMetadataResponse;
import com.friendoncampus.supplier.web.dto.SupplierResponse;
import com.friendoncampus.supplier.web.dto.UpdateSupplierRequest;
import com.friendoncampus.supplier.web.error.ApiErrorDocumentation;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/suppliers")
@Tag(name = "Suppliers", description = "Browse and administer campus suppliers")
public class SupplierController {

    private final SupplierService supplierService;
    private final SupplierImageService supplierImageService;

    public SupplierController(
            SupplierService supplierService,
            SupplierImageService supplierImageService) {
        this.supplierService = supplierService;
        this.supplierImageService = supplierImageService;
    }

    @Operation(
            operationId = "listSuppliers",
            summary = "List active suppliers",
            description = "Searches and filters active suppliers. Filters combine with AND, while search matches name, building, or location description.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Page of matching active suppliers",
                    content = @Content(schema = @Schema(implementation = SupplierListResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "Invalid pagination or sort query",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.InvalidRequest.class)))
    })
    @GetMapping
    public SupplierListResponse listSuppliers(
            @Parameter(description = "Case-insensitive partial match across name, building, and location description", example = "central")
            @RequestParam(required = false) String search,
            @Parameter(description = "Case-insensitive exact supplier type", example = "Food")
            @RequestParam(required = false) String type,
            @Parameter(description = "Case-insensitive exact building name", example = "Central Library")
            @RequestParam(required = false) String building,
            @Parameter(
                    description = "Zero-based page number",
                    schema = @Schema(type = "integer", minimum = "0", defaultValue = "0"),
                    example = "0")
            @RequestParam(required = false) String page,
            @Parameter(
                    description = "Records per page",
                    schema = @Schema(type = "integer", minimum = "1", maximum = "100", defaultValue = "20"),
                    example = "20")
            @RequestParam(required = false) String size,
            @Parameter(
                    description = "Sort as field,direction. Fields: name, type, building, openingTime, closingTime, createdAt, updatedAt. Directions: asc or desc.",
                    schema = @Schema(type = "string", defaultValue = "name,asc"),
                    example = "name,asc")
            @RequestParam(required = false) String sort) {
        SupplierQuery query = SupplierQuery.from(search, type, building, page, size, sort);
        return SupplierListResponse.from(supplierService.listActiveSuppliers(query));
    }

    @Operation(
            operationId = "getSupplierMetadata",
            summary = "Get active supplier filter values",
            description = "Returns distinct supplier types and buildings from active suppliers, sorted case-insensitively.")
    @ApiResponse(
            responseCode = "200",
            description = "Filter metadata for active suppliers",
            content = @Content(schema = @Schema(implementation = SupplierMetadataResponse.class)))
    @GetMapping("/metadata")
    public SupplierMetadataResponse getSupplierMetadata() {
        return SupplierMetadataResponse.from(supplierService.getActiveSupplierMetadata());
    }

    @Operation(
            operationId = "getSupplier",
            summary = "Get a supplier",
            description = "Retrieves an active or inactive supplier by UUID.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Supplier found",
                    content = @Content(schema = @Schema(implementation = SupplierResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "Malformed supplier UUID",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.InvalidRequest.class))),
            @ApiResponse(
                    responseCode = "404",
                    description = "Supplier not found",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.SupplierNotFound.class)))
    })
    @GetMapping("/{id}")
    public SupplierResponse getSupplier(
            @Parameter(description = "Supplier UUID", required = true, example = "ca9bd61f-93da-4500-9e9d-48de1bea52fa")
            @PathVariable UUID id) {
        return SupplierResponse.from(supplierService.getSupplier(id));
    }

    @Operation(
            operationId = "getSupplierImage",
            summary = "Get an uploaded supplier image",
            description = "Streams an uploaded JPEG, PNG, or WebP image from private object storage. External image URLs are returned directly in the Supplier representation instead.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Uploaded supplier image",
                    content = @Content(
                            mediaType = "image/*",
                            schema = @Schema(type = "string", format = "binary"))),
            @ApiResponse(
                    responseCode = "404",
                    description = "Supplier or uploaded image not found",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.SupplierNotFound.class))),
            @ApiResponse(
                    responseCode = "503",
                    description = "Image storage is temporarily unavailable",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.SupplierImageUnavailable.class)))
    })
    @GetMapping("/{id}/image")
    public ResponseEntity<byte[]> getSupplierImage(
            @Parameter(description = "Supplier UUID", required = true)
            @PathVariable UUID id) {
        SupplierImageService.SupplierImage image = supplierImageService.load(id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(image.contentType()))
                .contentLength(image.content().length)
                .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePublic().immutable())
                .eTag("\"supplier-" + id + "-v" + image.supplierVersion() + "\"")
                .header("X-Content-Type-Options", "nosniff")
                .body(image.content());
    }

    @Operation(
            operationId = "createSupplier",
            summary = "Create a supplier",
            description = "Creates an active or inactive supplier. Requires an ADMIN access token.",
            security = @SecurityRequirement(name = "bearerAuth"))
    @ApiResponses({
            @ApiResponse(
                    responseCode = "201",
                    description = "Supplier created",
                    headers = @Header(
                            name = "Location",
                            description = "Relative URL of the created supplier",
                            schema = @Schema(type = "string", example = "/api/suppliers/184a5d15-0714-47ad-9ee9-524bf84f361c")),
                    content = @Content(schema = @Schema(implementation = SupplierResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "Missing, malformed, or invalid supplier fields",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.InvalidSupplierRequest.class))),
            @ApiResponse(
                    responseCode = "401",
                    description = "Bearer token is missing or invalid",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.Unauthorized.class))),
            @ApiResponse(
                    responseCode = "403",
                    description = "Authenticated user is not an administrator",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.Forbidden.class)))
    })
    @PostMapping
    public ResponseEntity<SupplierResponse> createSupplier(
            @Valid @RequestBody CreateSupplierRequest request) {
        SupplierResponse response = SupplierResponse.from(
                supplierService.createSupplier(request.toCommand()));
        URI location = URI.create("/api/suppliers/" + response.id());
        return ResponseEntity.created(location).body(response);
    }

    @Operation(
            operationId = "updateSupplier",
            summary = "Replace supplier details",
            description = "Fully replaces editable details while preserving status, ID, and creation time. Use the latest version to prevent lost updates. Requires an ADMIN access token.",
            security = @SecurityRequirement(name = "bearerAuth"))
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Supplier updated, or unchanged when the request is a no-op",
                    content = @Content(schema = @Schema(implementation = SupplierResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "Malformed UUID or invalid request body",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(oneOf = {
                                    ApiErrorDocumentation.InvalidRequest.class,
                                    ApiErrorDocumentation.InvalidSupplierRequest.class
                            }))),
            @ApiResponse(
                    responseCode = "404",
                    description = "Supplier not found",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.SupplierNotFound.class))),
            @ApiResponse(
                    responseCode = "409",
                    description = "Requested version is stale",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.SupplierUpdateConflict.class))),
            @ApiResponse(
                    responseCode = "401",
                    description = "Bearer token is missing or invalid",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.Unauthorized.class))),
            @ApiResponse(
                    responseCode = "403",
                    description = "Authenticated user is not an administrator",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.Forbidden.class)))
    })
    @PutMapping("/{id}")
    public SupplierResponse updateSupplier(
            @Parameter(description = "Supplier UUID", required = true, example = "ca9bd61f-93da-4500-9e9d-48de1bea52fa")
            @PathVariable UUID id,
            @Valid @RequestBody UpdateSupplierRequest request) {
        return SupplierResponse.from(supplierService.updateSupplier(id, request.toCommand()));
    }

    @Operation(
            operationId = "changeSupplierStatus",
            summary = "Change supplier status",
            description = "Activates or deactivates a supplier without resending its details. Use the latest version to prevent lost updates. Requires an ADMIN access token.",
            security = @SecurityRequirement(name = "bearerAuth"))
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Status changed, or unchanged when the request is a no-op",
                    content = @Content(schema = @Schema(implementation = SupplierResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "Malformed UUID or invalid request body",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(oneOf = {
                                    ApiErrorDocumentation.InvalidRequest.class,
                                    ApiErrorDocumentation.InvalidSupplierRequest.class
                            }))),
            @ApiResponse(
                    responseCode = "404",
                    description = "Supplier not found",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.SupplierNotFound.class))),
            @ApiResponse(
                    responseCode = "409",
                    description = "Requested version is stale",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.SupplierUpdateConflict.class))),
            @ApiResponse(
                    responseCode = "401",
                    description = "Bearer token is missing or invalid",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.Unauthorized.class))),
            @ApiResponse(
                    responseCode = "403",
                    description = "Authenticated user is not an administrator",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.Forbidden.class)))
    })
    @PatchMapping("/{id}/status")
    public SupplierResponse changeSupplierStatus(
            @Parameter(description = "Supplier UUID", required = true, example = "ca9bd61f-93da-4500-9e9d-48de1bea52fa")
            @PathVariable UUID id,
            @Valid @RequestBody ChangeSupplierStatusRequest request) {
        return SupplierResponse.from(
                supplierService.changeSupplierStatus(id, request.toCommand()));
    }

    @Operation(
            operationId = "deleteSupplier",
            summary = "Permanently delete a supplier",
            description = "Hard-deletes an active or inactive supplier. Prefer INACTIVE for normal removal from listings. The version prevents deletion of unseen changes. Requires an ADMIN access token.",
            security = @SecurityRequirement(name = "bearerAuth"))
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Supplier permanently deleted"),
            @ApiResponse(
                    responseCode = "400",
                    description = "Malformed UUID or missing, negative, decimal, or nonnumeric version",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.InvalidRequest.class))),
            @ApiResponse(
                    responseCode = "404",
                    description = "Supplier not found or already deleted",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.SupplierNotFound.class))),
            @ApiResponse(
                    responseCode = "409",
                    description = "Requested version is stale",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.SupplierUpdateConflict.class))),
            @ApiResponse(
                    responseCode = "401",
                    description = "Bearer token is missing or invalid",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.Unauthorized.class))),
            @ApiResponse(
                    responseCode = "403",
                    description = "Authenticated user is not an administrator",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.Forbidden.class)))
    })
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSupplier(
            @Parameter(description = "Supplier UUID", required = true, example = "ca9bd61f-93da-4500-9e9d-48de1bea52fa")
            @PathVariable UUID id,
            @Parameter(
                    description = "Version from the latest supplier response",
                    required = true,
                    schema = @Schema(type = "integer", format = "int64", minimum = "0"),
                    example = "2")
            @RequestParam(required = false) String version) {
        supplierService.deleteSupplier(id, DeleteSupplierCommand.from(version));
        return ResponseEntity.noContent().build();
    }
}
