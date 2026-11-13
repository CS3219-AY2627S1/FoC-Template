package sg.edu.nus.foc.supplier.supplier;

import java.time.LocalTime;
import java.time.ZoneId;

/** Opening-hours rules. Hours are campus-local (Asia/Singapore). */
public final class OpeningHours {

    public static final ZoneId CAMPUS_ZONE = ZoneId.of("Asia/Singapore");

    private OpeningHours() {
    }

    /**
     * Closing time is inclusive so "0000hrs-2359hrs" means open all day. A closing time before
     * the opening time means the supplier closes after midnight (e.g. 1100hrs-0200hrs).
     */
    public static boolean isOpen(LocalTime opening, LocalTime closing, LocalTime now) {
        if (opening.equals(closing)) {
            return true;
        }
        if (opening.isBefore(closing)) {
            return !now.isBefore(opening) && !now.isAfter(closing);
        }
        return !now.isBefore(opening) || !now.isAfter(closing);
    }
}
