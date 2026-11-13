package sg.edu.nus.foc.supplier.supplier;

import java.util.List;

/**
 * Result of validating an errand's pickup and delivery suppliers for the Order Service (F5.1).
 *
 * @param problems empty when {@code valid}; otherwise which supplier failed and why (F5.1.3)
 */
public record PairValidation(boolean valid, List<Problem> problems) {

    public record Problem(String field, String supplierId, Reason reason) {
    }

    public enum Reason {
        /** No supplier has this ID. */
        NOT_FOUND,
        /** The supplier exists but is deactivated, so it cannot be used for new errands (F1.3.2). */
        INACTIVE,
        /** Pickup and delivery are the same supplier. */
        SAME_SUPPLIER
    }
}
