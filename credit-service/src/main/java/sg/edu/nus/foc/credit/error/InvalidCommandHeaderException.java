package sg.edu.nus.foc.credit.error;

public class InvalidCommandHeaderException extends RuntimeException {

    private final String field;

    public InvalidCommandHeaderException(String field, String message) {
        super(message);
        this.field = field;
    }

    public String field() {
        return field;
    }
}
