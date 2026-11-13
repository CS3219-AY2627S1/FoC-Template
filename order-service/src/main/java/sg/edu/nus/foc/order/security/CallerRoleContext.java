package sg.edu.nus.foc.order.security;

import java.util.Set;

/** Account facts verified by User Service for this request; null suspension is unknown. */
public record CallerRoleContext(Set<Role> roles, Boolean courierSuspended) {
    public CallerRoleContext {
        roles = Set.copyOf(roles);
    }
}
