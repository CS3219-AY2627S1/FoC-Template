package sg.edu.nus.foc.supplier.supplier;

public class SupplierNotFoundException extends RuntimeException {

    private final String supplierId;

    public SupplierNotFoundException(String supplierId) {
        super("Supplier " + supplierId + " was not found.");
        this.supplierId = supplierId;
    }

    public String supplierId() {
        return supplierId;
    }
}
