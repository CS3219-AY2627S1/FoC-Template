package com.cs3219.foc.supplier.model.dto;

import com.cs3219.foc.supplier.model.entity.SupplierCategory;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Objects;

/** Request body format used for create or update a supplier */
public record SupplierRequest(
        @NotBlank @Size(max = 255) String name,
        @NotNull SupplierCategory category,
        @NotBlank @Size(max = 255) String building,
        @Size(max = 32) String floor,
        @Size(max = 500) String locationDescription,
        @DecimalMin("-90.0") @DecimalMax("90.0") Double latitude,
        @DecimalMin("-180.0") @DecimalMax("180.0") Double longitude,

        /** Days that the supplier opens and rest are closed. */
        @NotEmpty @Size(max = 7) List<@NotNull @Valid OpeningHoursDto> openingHours) {

    @JsonIgnore
    @AssertTrue(message = "each day can only be listed once") public boolean isEachDayListedOnce() {
        if (openingHours == null) {
            return true;
        }
        var days = openingHours.stream()
                .filter(Objects::nonNull)
                .map(OpeningHoursDto::dayOfWeek)
                .filter(Objects::nonNull)
                .toList();
        return days.size() == days.stream().distinct().count();
    }

    /**
     * Trim the text so the same place won't be identified as two places. eg. "COM2  " and
     * "COM2" are same place.
     */
    @JsonIgnore
    public SupplierRequest normalized() {
        return new SupplierRequest(
                tidy(name),
                category,
                tidy(building),
                tidy(floor),
                tidy(locationDescription),
                latitude,
                longitude,
                openingHours);
    }

    private static String tidy(String text) {
        if (text == null) {
            return null;
        }
        var tidied = text.strip().replaceAll("\\s+", " ");
        return tidied.isEmpty() ? null : tidied;
    }
}
