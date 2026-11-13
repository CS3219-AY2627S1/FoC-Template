package sg.edu.nus.foc.order.application;

public interface UserServicePort {
    /**
     * Verifies the bearer token and returns the provider-confirmed user ID.
     * The caller must use this returned ID rather than trusting a request-body ID.
     */
    String verifyRequester(String userId, String authorization);

    /** Verifies courier role/identity for existing work; suspension does not remove the role. */
    String verifyCourier(String userId, String authorization);

    /** Extra guard for a new assignment only. Local mock accounts are nonsuspended. */
    void requireCourierAcceptance(String userId, String authorization);
}
