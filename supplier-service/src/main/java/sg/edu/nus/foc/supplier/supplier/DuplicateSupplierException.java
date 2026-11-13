package sg.edu.nus.foc.supplier.supplier;

public class DuplicateSupplierException extends RuntimeException {

    private final String existingSupplierId;

    public DuplicateSupplierException(String existingSupplierId) {
        super("A supplier with the same name already exists in this building.");
        this.existingSupplierId = existingSupplierId;
    }

    public String existingSupplierId() {
        return existingSupplierId;
    }
}
