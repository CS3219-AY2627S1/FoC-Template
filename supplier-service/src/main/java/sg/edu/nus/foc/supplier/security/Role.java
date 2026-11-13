package sg.edu.nus.foc.supplier.security;

import java.util.Locale;
import java.util.Optional;

/** FoC platform roles, owned by the User Service. Mapped to Spring authorities {@code ROLE_<NAME>}. */
public enum Role {
    REQUESTER,
    COURIER,
    ADMIN;

    public String authority() {
        return "ROLE_" + name();
    }

    public String id() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static Optional<Role> fromId(String value) {
        if (value == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(valueOf(value.strip().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
