package sg.edu.nus.foc.supplier.supplier;

/** A supplier in a search result with request-specific values. */
public record SupplierMatch(Supplier supplier, Double distanceMeters, boolean openNow) {
}
