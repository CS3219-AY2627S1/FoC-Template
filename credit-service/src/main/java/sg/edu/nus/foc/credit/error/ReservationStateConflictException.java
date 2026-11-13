package sg.edu.nus.foc.credit.error;

public class ReservationStateConflictException extends RuntimeException {
    public ReservationStateConflictException(String orderId, String message) {
        super("Credit reservation for order " + orderId + " " + message);
    }
}
