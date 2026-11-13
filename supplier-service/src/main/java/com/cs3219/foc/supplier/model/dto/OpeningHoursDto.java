package com.cs3219.foc.supplier.model.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.time.DayOfWeek;
import java.time.LocalTime;

/**
 * Every day open hour need specify separately. {@code closesAt} earlier than {@code opensAt} means the supplier closes after
 * midnight, at the next day
 */
public record OpeningHoursDto(
        @NotNull DayOfWeek dayOfWeek,
        @NotNull LocalTime opensAt,
        @NotNull LocalTime closesAt) {

    @JsonIgnore
    @AssertTrue(message = "closing time must be different from opening time") public boolean isClosingDifferentFromOpening() {
        return opensAt == null || closesAt == null || !opensAt.equals(closesAt);
    }
}
