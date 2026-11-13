package sg.edu.nus.foc.credit.security;

/** Signals that authoritative User Service roles could not be resolved safely. */
public class RoleLookupException extends RuntimeException {
    public RoleLookupException(String message, Throwable cause) {
        super(message, cause);
    }
}
