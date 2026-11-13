package sg.edu.nus.foc.supplier.api;

/** Single-ID validation for other services (F5.3). */
public record SupplierStatusResponse(String id, boolean exists, boolean active) {
}
