package sg.edu.nus.foc.user.validation;

import java.util.Locale;

public final class NusEmailValidator {

    private NusEmailValidator() {}

    public static boolean isValid(String email) {
        return email != null
                && email.trim().toLowerCase(Locale.ROOT)
                    .matches("^[^@\\s]+@u\\.nus\\.edu$");
    }
}