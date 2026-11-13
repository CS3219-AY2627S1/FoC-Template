package sg.edu.nus.foc.supplier.support;

import java.time.Instant;
import java.time.LocalTime;

import sg.edu.nus.foc.supplier.supplier.Supplier;
import sg.edu.nus.foc.supplier.supplier.SupplierDetails;
import sg.edu.nus.foc.supplier.supplier.SupplierSource;

/** Test data builders. */
public final class Suppliers {

    private Suppliers() {
    }

    public static SupplierDetails details(String name, String type, String building) {
        return new SupplierDetails(name, type, building, "1", "Near the entrance", 1.2966, 103.7764,
                LocalTime.of(9, 0), LocalTime.of(18, 0), null);
    }

    public static SupplierDetails details(String name, String type, String building, double lat, double lng,
                                          LocalTime open, LocalTime close) {
        return new SupplierDetails(name, type, building, "1", "Near the entrance", lat, lng, open, close, null);
    }

    public static Supplier supplier(String id, SupplierDetails details, boolean active) {
        Instant t = Instant.parse("2026-09-01T00:00:00Z");
        return new Supplier(id, details, active, SupplierSource.ADMIN, null, false, t, t);
    }
}
