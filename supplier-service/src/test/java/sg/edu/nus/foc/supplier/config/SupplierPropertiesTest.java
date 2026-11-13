package sg.edu.nus.foc.supplier.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;

class SupplierPropertiesTest {

    @Test
    void appliesSafeDefaults() {
        SupplierProperties p = new SupplierProperties(null, null, null, null, null, null);
        assertThat(p.firestore().projectId()).isEqualTo("demo-foc");
        assertThat(p.firestore().databaseId()).isEqualTo("(default)");
        assertThat(p.firestore().emulatorHost()).isEmpty();
        assertThat(p.auth().usesEmulator()).isFalse();
        assertThat(p.userService().mode()).isEqualTo(SupplierProperties.Mode.MOCK);
        assertThat(p.userService().timeout()).isEqualTo(Duration.ofSeconds(3));
        assertThat(p.userService().roleCacheTtl()).isEqualTo(Duration.ofSeconds(30));
        assertThat(p.seedFile()).isEmpty();
        assertThat(p.corsOrigins()).isEmpty();
        assertThat(p.cacheTtl()).isEqualTo(SupplierProperties.MAX_CACHE_TTL);
    }

    @Test
    void cacheTtlCannotExceedSixtySecondsOrBeNegative() {
        assertThat(new SupplierProperties(null, null, null, " x.csv ", Duration.ofMinutes(5), List.of("a"))
                .cacheTtl()).isEqualTo(Duration.ofSeconds(60));
        assertThat(new SupplierProperties(null, null, null, null, Duration.ofSeconds(-1), null).cacheTtl())
                .isEqualTo(Duration.ofSeconds(60));
        assertThat(new SupplierProperties(null, null, null, null, Duration.ofSeconds(5), null).cacheTtl())
                .isEqualTo(Duration.ofSeconds(5));
    }

    @Test
    void trimsAndDefaultsBlankValues() {
        SupplierProperties p = new SupplierProperties(
                new SupplierProperties.FirestoreSettings(" ", "", " emu:1 "),
                new SupplierProperties.AuthSettings(" proj ", " emu:2 "),
                null, " seed.csv ", null, null);
        assertThat(p.firestore().projectId()).isEqualTo("demo-foc");
        assertThat(p.firestore().emulatorHost()).isEqualTo("emu:1");
        assertThat(p.auth().projectId()).isEqualTo("proj");
        assertThat(p.auth().usesEmulator()).isTrue();
        assertThat(p.seedFile()).isEqualTo("seed.csv");
    }

    @Test
    void userServiceTimeoutsMustBePositiveAndTheRoleCacheCanBeDisabled() {
        var userService = new SupplierProperties.UserServiceSettings(null, null, null, Duration.ZERO, Duration.ZERO);
        assertThat(userService.timeout()).isEqualTo(Duration.ofSeconds(3));
        assertThat(userService.roleCacheTtl()).isZero();
        assertThat(new SupplierProperties.UserServiceSettings(null, null, null, Duration.ofSeconds(20),
                Duration.ofSeconds(-1)).roleCacheTtl()).isEqualTo(Duration.ofSeconds(30));
    }
}
