package sg.edu.nus.foc.supplier.api;

import java.util.List;

/** Found suppliers (active or not, F5.2.1) plus the IDs that do not exist. */
public record LookupResponse(List<SupplierResponse> items, List<String> missingIds) {
}
