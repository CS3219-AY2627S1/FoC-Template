package sg.edu.nus.foc.supplier.api;

import java.util.List;

/** What the caller may do in this service, so the UI can hide actions it would reject anyway. */
public record PermissionsResponse(String uid, String email, List<String> roles, boolean canManageSuppliers) {
}
