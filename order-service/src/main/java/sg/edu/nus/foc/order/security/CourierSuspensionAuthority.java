package sg.edu.nus.foc.order.security;

import org.springframework.security.core.GrantedAuthority;

/** Verified account state, separate from roles and never read from browser-supplied claims. */
public record CourierSuspensionAuthority(boolean suspended) implements GrantedAuthority {
    @Override
    public String getAuthority() {
        return suspended ? "COURIER_SUSPENDED" : "COURIER_ACCEPTANCE_ALLOWED";
    }
}
