package sg.edu.nus.foc.order.application;

public interface CreditServicePort {
    void reserve(String orderId, String requesterId, long amount, String authorization);
    void assignCourier(String orderId, String courierId, String authorization);
    void holdForReopen(String orderId, String authorization);
}
