package sg.edu.nus.foc.supplier.seed;

import sg.edu.nus.foc.supplier.supplier.SupplierDetails;

/**
 * A valid seed row.
 *
 * @param rowNumber line number in the file (the header is line 1)
 * @param id        optional explicit supplier ID from an {@code Id} column (F2.3.3); null if absent
 */
public record SeedRow(long rowNumber, String id, SupplierDetails details) {
}
