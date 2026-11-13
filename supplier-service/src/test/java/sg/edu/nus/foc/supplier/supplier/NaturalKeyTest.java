package sg.edu.nus.foc.supplier.supplier;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class NaturalKeyTest {

    @Test
    void sameNameAndBuildingIgnoringCaseSpacingAndQuotesGiveSameKey() {
        assertThat(NaturalKey.of("Anna's  x Soup Union", "Central Library"))
                .isEqualTo(NaturalKey.of(" anna’s x soup union ", "CENTRAL   LIBRARY"));
    }

    @Test
    void differentBuildingGivesDifferentKey() {
        assertThat(NaturalKey.of("Cool Spot", "Com2")).isNotEqualTo(NaturalKey.of("Cool Spot", "Com3"));
    }

    @Test
    void keyIsAHexDigestSafeForDocumentIds() {
        assertThat(NaturalKey.of("A/B", "C/D")).matches("[0-9a-f]{64}");
    }

    @Test
    void normaliseTreatsNullAsEmpty() {
        assertThat(NaturalKey.normalise(null)).isEmpty();
    }
}
