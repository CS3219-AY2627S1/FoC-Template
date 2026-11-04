package sg.edu.nus.foc.order.domain;

/** Confirmed business rejection, not an expired login or uncertain financial outcome. */
public final class CourierAcceptanceDenied extends OrderProblem {
    public CourierAcceptanceDenied() {
        super("FORBIDDEN", "Your courier access is suspended. You cannot accept new errands, but you can continue errands already assigned to you.");
    }
}
