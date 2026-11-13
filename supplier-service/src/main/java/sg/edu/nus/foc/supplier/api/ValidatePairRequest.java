package sg.edu.nus.foc.supplier.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Body of {@code POST /api/suppliers/validate}, used by the Order Service when an errand is created. */
public record ValidatePairRequest(
        @NotBlank @Size(max = 128) String pickupSupplierId,
        @NotBlank @Size(max = 128) String deliverySupplierId) {
}
