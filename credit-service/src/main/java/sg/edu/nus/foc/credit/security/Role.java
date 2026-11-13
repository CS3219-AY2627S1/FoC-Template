package sg.edu.nus.foc.credit.security;

import java.util.Locale;
import java.util.Optional;

/** User Service-owned application roles mapped to Spring Security authorities. */
public enum Role {
    REQUESTER,
    COURIER,
    ADMIN;

    public String authority() {
        return "ROLE_" + name();
    }

    public static Optional<Role> fromId(String value) {
        if (value == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(valueOf(value.strip().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }
}
