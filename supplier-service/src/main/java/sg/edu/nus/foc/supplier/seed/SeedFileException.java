package sg.edu.nus.foc.supplier.seed;

/** The seed file as a whole is unusable (missing, unreadable or malformed); startup must fail (F2.2.2). */
public class SeedFileException extends RuntimeException {

    public SeedFileException(String message) {
        super(message);
    }

    public SeedFileException(String message, Throwable cause) {
        super(message, cause);
    }
}
