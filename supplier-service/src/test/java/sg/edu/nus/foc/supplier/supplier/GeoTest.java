package sg.edu.nus.foc.supplier.supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import org.junit.jupiter.api.Test;

class GeoTest {

    @Test
    void samePointIsZeroMetres() {
        assertThat(Geo.distanceMeters(1.2966, 103.7764, 1.2966, 103.7764)).isZero();
    }

    @Test
    void com2ToCentralLibraryIsAboutThreeHundredMetres() {
        double metres = Geo.distanceMeters(1.2938347, 103.7744572, 1.296444, 103.773032);
        assertThat(metres).isCloseTo(330, within(30.0));
    }
}
