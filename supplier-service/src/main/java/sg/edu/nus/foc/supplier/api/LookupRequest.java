package sg.edu.nus.foc.supplier.api;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

/** Body of {@code POST /api/suppliers/lookup}: resolve many IDs at once (e.g. an order history page). */
public record LookupRequest(@NotEmpty @Size(max = 100) List<@NotBlank @Size(max = 128) String> ids) {
}
