package com.friendoncampus.supplier.web;

import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.friendoncampus.supplier.service.AdminSupplierQuery;
import com.friendoncampus.supplier.service.DeleteSupplierCommand;
import com.friendoncampus.supplier.service.SupplierImageService;
import com.friendoncampus.supplier.service.SupplierService;
import com.friendoncampus.supplier.web.dto.SupplierListResponse;
import com.friendoncampus.supplier.web.dto.SupplierMetadataResponse;
import com.friendoncampus.supplier.web.dto.SupplierResponse;
import com.friendoncampus.supplier.web.error.ApiErrorDocumentation;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/admin/suppliers")
@Tag(
        name = "Supplier administration",
        description = "Administrative Supplier queries restricted to the ADMIN role")
@SecurityRequirement(name = "bearerAuth")
public class AdminSupplierController {

    private final SupplierService supplierService;
    private final SupplierImageService supplierImageService;

    public AdminSupplierController(
            SupplierService supplierService,
            SupplierImageService supplierImageService) {
        this.supplierService = supplierService;
        this.supplierImageService = supplierImageService;
    }

    @Operation(
            operationId = "listSuppliersForAdmin",
            summary = "List suppliers for administration",
            description = "Searches active and inactive suppliers. An optional status filter narrows the results. Requires an ADMIN access token.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Page of matching suppliers",
                    content = @Content(schema = @Schema(implementation = SupplierListResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "Invalid status, pagination, or sort query",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.InvalidRequest.class))),
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
    @GetMapping
    public SupplierListResponse listSuppliers(
            @Parameter(description = "Case-insensitive partial match across name, building, and location description", example = "central")
            @RequestParam(required = false) String search,
            @Parameter(description = "Case-insensitive exact supplier type", example = "Food")
            @RequestParam(required = false) String type,
            @Parameter(description = "Case-insensitive exact building name", example = "Central Library")
            @RequestParam(required = false) String building,
            @Parameter(
                    description = "Optional supplier status. Omit to include every status.",
                    schema = @Schema(type = "string", allowableValues = {"ACTIVE", "INACTIVE"}),
                    example = "INACTIVE")
            @RequestParam(required = false) String status,
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
                    description = "Sort as field,direction. Fields: name, type, building, openingTime, closingTime, createdAt, updatedAt, status. Directions: asc or desc.",
                    schema = @Schema(type = "string", defaultValue = "name,asc"),
                    example = "updatedAt,desc")
            @RequestParam(required = false) String sort) {
        AdminSupplierQuery query = AdminSupplierQuery.from(
                search, type, building, status, page, size, sort);
        return SupplierListResponse.from(supplierService.listSuppliersForAdmin(query));
    }

    @Operation(
            operationId = "getAdminSupplierMetadata",
            summary = "Get administrative supplier filter values",
            description = "Returns distinct types and buildings across active and inactive suppliers. Requires an ADMIN access token.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Filter metadata across all suppliers",
                    content = @Content(schema = @Schema(implementation = SupplierMetadataResponse.class))),
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
    @GetMapping("/metadata")
    public SupplierMetadataResponse getSupplierMetadata() {
        return SupplierMetadataResponse.from(supplierService.getAllSupplierMetadata());
    }

    @Operation(
            operationId = "uploadSupplierImage",
            summary = "Upload or replace a supplier image",
            description = "Stores a validated JPEG, PNG, or WebP image up to 5 MB in private object storage. Replaces any external URL or previous upload. Requires the latest Supplier version and an ADMIN access token.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Image uploaded",
                    content = @Content(schema = @Schema(implementation = SupplierResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "Missing version or invalid image",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.InvalidSupplierImage.class))),
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
                    responseCode = "503",
                    description = "Image storage is unavailable",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.SupplierImageUnavailable.class)))
    })
    @PutMapping(path = "/{id}/image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public SupplierResponse uploadSupplierImage(
            @PathVariable UUID id,
            @Parameter(
                    description = "Version from the latest supplier response",
                    required = true,
                    schema = @Schema(type = "integer", format = "int64", minimum = "0"))
            @RequestParam(required = false) String version,
            @Parameter(description = "JPEG, PNG, or WebP image up to 5 MB", required = true)
            @RequestPart("file") MultipartFile file) {
        long parsedVersion = DeleteSupplierCommand.from(version).version();
        return SupplierResponse.from(supplierImageService.upload(id, parsedVersion, file));
    }

    @Operation(
            operationId = "removeSupplierImage",
            summary = "Remove a supplier image",
            description = "Clears either an external image URL or an uploaded image. Requires the latest Supplier version and an ADMIN access token.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Image removed, or unchanged when no image exists",
                    content = @Content(schema = @Schema(implementation = SupplierResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "Missing or invalid version",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.InvalidRequest.class))),
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
                            schema = @Schema(implementation = ApiErrorDocumentation.SupplierUpdateConflict.class)))
    })
    @DeleteMapping("/{id}/image")
    public SupplierResponse removeSupplierImage(
            @PathVariable UUID id,
            @Parameter(
                    description = "Version from the latest supplier response",
                    required = true,
                    schema = @Schema(type = "integer", format = "int64", minimum = "0"))
            @RequestParam(required = false) String version) {
        long parsedVersion = DeleteSupplierCommand.from(version).version();
        return SupplierResponse.from(supplierImageService.remove(id, parsedVersion));
    }
}
