package sg.edu.nus.foc.supplier.error;

import org.springframework.security.access.AccessDeniedException;

/** An authorisation failure decided in application code, with a message that is safe to show users. */
public class ForbiddenException extends AccessDeniedException {

    public ForbiddenException(String message) {
        super(message);
    }
}
