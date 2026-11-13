package sg.edu.nus.foc.supplier.api;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

/** Shared request constraints so create and update validate the same way. */
final class SupplierRequests {

    static final String TIME_PATTERN = "^([01]\\d|2[0-3]):[0-5]\\d$";
    static final String TIME_MESSAGE = "must be a 24-hour time like 09:00";
    static final String NOT_BLANK_PATTERN = "(?s).*\\S.*";
    /** An http(s) URL, or empty for no image: a blank create form field, or a PATCH that clears it. */
    static final String OPTIONAL_URL_PATTERN = "^$|^https?://\\S+$";

    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");

    private SupplierRequests() {
    }

    static LocalTime parseTime(String value) {
        return LocalTime.parse(value, HH_MM);
    }

    static String formatTime(LocalTime time) {
        return time.format(HH_MM);
    }

    static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.strip();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
