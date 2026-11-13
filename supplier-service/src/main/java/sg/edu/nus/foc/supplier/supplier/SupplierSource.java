package sg.edu.nus.foc.supplier.supplier;

/** Where a supplier record originated. Seed reloads only deactivate records they created (F2.4.1). */
public enum SupplierSource {
    SEED,
    ADMIN
}
