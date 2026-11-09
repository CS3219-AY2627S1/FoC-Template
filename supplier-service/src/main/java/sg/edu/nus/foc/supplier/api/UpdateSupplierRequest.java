package sg.edu.nus.foc.supplier.api;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import sg.edu.nus.foc.supplier.supplier.SupplierDetails;

/**
 * Body of {@code PATCH /api/suppliers/{id}}: every field optional, omitted fields are unchanged.
 * Required fields cannot be blanked; optional text fields are cleared with an empty string.
 * The ID is not part of the body, so it can never change (F6.2.3).
 */
public record UpdateSupplierRequest(
        @Size(max = 100) @Pattern(regexp = SupplierRequests.NOT_BLANK_PATTERN, message = "must not be blank") String name,
        @Size(max = 40) @Pattern(regexp = SupplierRequests.NOT_BLANK_PATTERN, message = "must not be blank") String type,
        @Size(max = 100) @Pattern(regexp = SupplierRequests.NOT_BLANK_PATTERN, message = "must not be blank") String building,
        @Size(max = 10) String floor,
        @Size(max = 200) String locationDescription,
        @DecimalMin("-90") @DecimalMax("90") Double latitude,
        @DecimalMin("-180") @DecimalMax("180") Double longitude,
        @Pattern(regexp = SupplierRequests.TIME_PATTERN, message = SupplierRequests.TIME_MESSAGE) String openingTime,
        @Pattern(regexp = SupplierRequests.TIME_PATTERN, message = SupplierRequests.TIME_MESSAGE) String closingTime,
        @Size(max = 500) @Pattern(regexp = SupplierRequests.OPTIONAL_URL_PATTERN, message = "must be an http(s) URL")
        String imageUrl,
        Boolean active) {

    SupplierDetails applyTo(SupplierDetails current) {
        return new SupplierDetails(
                name != null ? name.strip() : current.name(),
                type != null ? type.strip() : current.type(),
                building != null ? building.strip() : current.building(),
                floor != null ? SupplierRequests.trimToNull(floor) : current.floor(),
                locationDescription != null ? SupplierRequests.trimToNull(locationDescription)
                        : current.locationDescription(),
                latitude != null ? latitude : current.latitude(),
                longitude != null ? longitude : current.longitude(),
                openingTime != null ? SupplierRequests.parseTime(openingTime) : current.openingTime(),
                closingTime != null ? SupplierRequests.parseTime(closingTime) : current.closingTime(),
                imageUrl != null ? SupplierRequests.trimToNull(imageUrl) : current.imageUrl());
    }
}
