package sg.edu.nus.foc.order.application;

public interface SupplierServicePort {
    void validatePair(String pickupSupplierId, String deliverySupplierId, String authorization);
}
