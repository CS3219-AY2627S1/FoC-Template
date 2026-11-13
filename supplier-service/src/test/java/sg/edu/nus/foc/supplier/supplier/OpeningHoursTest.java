package sg.edu.nus.foc.supplier.supplier;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalTime;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class OpeningHoursTest {

    @ParameterizedTest(name = "{0}-{1} at {2} -> {3}")
    @CsvSource({
            // regular hours, boundaries inclusive
            "09:00, 18:00, 08:59, false",
            "09:00, 18:00, 09:00, true",
            "09:00, 18:00, 18:00, true",
            "09:00, 18:00, 18:01, false",
            // 0000hrs-2359hrs is all day
            "00:00, 23:59, 23:59, true",
            "00:00, 23:59, 00:00, true",
            // closes after midnight
            "11:00, 02:00, 23:30, true",
            "11:00, 02:00, 01:59, true",
            "11:00, 02:00, 02:01, false",
            "11:00, 02:00, 10:59, false",
            // same opening and closing time means always open
            "08:00, 08:00, 03:00, true",
    })
    void isOpen(LocalTime opening, LocalTime closing, LocalTime now, boolean expected) {
        assertThat(OpeningHours.isOpen(opening, closing, now)).isEqualTo(expected);
    }
}
