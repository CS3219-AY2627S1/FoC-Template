package sg.edu.nus.foc.order.application;

/** Fresh read-only checks for a server-owned saved plan, never a client identity bypass. */
public interface BackgroundRepostChecks {
    boolean fundingReady(String originalOrderId, String requesterId);
    void validate(String requesterId, String pickup, String delivery);
}
