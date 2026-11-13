package com.friendoncampus.supplier.web.dto;

import com.friendoncampus.supplier.domain.SupplierStatus;
import com.friendoncampus.supplier.service.ChangeSupplierStatusCommand;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

@Schema(description = "Status change guarded by the supplier's current version")
public record ChangeSupplierStatusRequest(
        @Schema(description = "Desired supplier status", example = "INACTIVE", allowableValues = {"ACTIVE", "INACTIVE"})
        @NotNull SupplierStatus status,
        @Schema(description = "Version from the latest supplier response", format = "int64", example = "0", minimum = "0")
        @NotNull @PositiveOrZero Long version) {

    public ChangeSupplierStatusCommand toCommand() {
        return new ChangeSupplierStatusCommand(status, version);
    }
}
