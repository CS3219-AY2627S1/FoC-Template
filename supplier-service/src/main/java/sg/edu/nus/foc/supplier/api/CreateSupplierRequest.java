package sg.edu.nus.foc.supplier.api;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import sg.edu.nus.foc.supplier.supplier.SupplierDetails;

/** Body of {@code POST /api/suppliers}. Name, type and campus location are mandatory (F1.2.3). */
public record CreateSupplierRequest(
        @NotBlank @Size(max = 100) String name,
        @NotBlank @Size(max = 40) String type,
        @NotBlank @Size(max = 100) String building,
        @Size(max = 10) String floor,
        @Size(max = 200) String locationDescription,
        @NotNull @DecimalMin("-90") @DecimalMax("90") Double latitude,
        @NotNull @DecimalMin("-180") @DecimalMax("180") Double longitude,
        @NotNull @Pattern(regexp = SupplierRequests.TIME_PATTERN, message = SupplierRequests.TIME_MESSAGE)
        String openingTime,
        @NotNull @Pattern(regexp = SupplierRequests.TIME_PATTERN, message = SupplierRequests.TIME_MESSAGE)
        String closingTime,
        @Size(max = 500) @Pattern(regexp = SupplierRequests.OPTIONAL_URL_PATTERN, message = "must be an http(s) URL")
        String imageUrl) {

    SupplierDetails toDetails() {
        return new SupplierDetails(
                name.strip(), type.strip(), building.strip(),
                SupplierRequests.trimToNull(floor), SupplierRequests.trimToNull(locationDescription),
                latitude, longitude,
                SupplierRequests.parseTime(openingTime), SupplierRequests.parseTime(closingTime),
                SupplierRequests.trimToNull(imageUrl));
    }
}
