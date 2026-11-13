package com.cs3219.foc.supplier.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.cs3219.foc.supplier.integration.AbstractIntegrationTest;
import com.cs3219.foc.supplier.model.entity.Supplier;
import com.cs3219.foc.supplier.model.entity.SupplierCategory;
import com.cs3219.foc.supplier.model.entity.SupplierOpeningHours;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.List;
import org.assertj.core.groups.Tuple;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class SupplierSpecificationsTests extends AbstractIntegrationTest {
    private static final List<DayOfWeek> EVERY_DAY = Arrays.asList(DayOfWeek.values());
    private static final List<DayOfWeek> WEEKDAYS = EVERY_DAY.subList(0, 5);

    @Autowired
    private SupplierRepository repository;

    @BeforeEach
    void setUp() {
        repository.deleteAll();
        repository.flush();
        repository.saveAll(List.of(
                supplier("Cool Spot", SupplierCategory.FOOD, "COM2", "Opp LT16", EVERY_DAY, "09:00", "21:30", true),
                supplier("TOMORO COFFEE", SupplierCategory.COFFEE, "HSSML", null, WEEKDAYS, "08:15", "18:00", true),
                supplier("Supersnacks", SupplierCategory.FOOD, "PGP", "Block 10", EVERY_DAY, "11:00", "02:00", true),
                supplier(
                        "Octobox",
                        SupplierCategory.SHOPPING,
                        "PGP",
                        "Near 100% entrance",
                        EVERY_DAY,
                        "00:00",
                        "23:59",
                        true),
                supplier("Closed Cafe", SupplierCategory.COFFEE, "COM2", null, EVERY_DAY, "09:00", "18:00", false)));
    }

    private static Supplier supplier(
            String name,
            SupplierCategory category,
            String building,
            String description,
            List<DayOfWeek> days,
            String opensAt,
            String closesAt,
            boolean active) {
        var supplier = Supplier.builder()
                .name(name)
                .category(category)
                .building(building)
                .locationDescription(description)
                .active(active)
                .build();
        supplier.replaceOpeningHours(days.stream()
                .map(day -> SupplierOpeningHours.builder()
                        .dayOfWeek(day)
                        .opensAt(LocalTime.parse(opensAt))
                        .closesAt(LocalTime.parse(closesAt))
                        .build())
                .toList());
        return supplier;
    }

    private List<String> names(Specification<Supplier> spec) {
        return repository.findAll(spec, Sort.by("name")).stream()
                .map(Supplier::getName)
                .toList();
    }

    private List<String> openAt(DayOfWeek day, String time) {
        return names(SupplierSpecifications.openAt(day, LocalTime.parse(time)).and(SupplierSpecifications.isActive()));
    }

    @Test
    void activeOnlyHidesDeactivatedSuppliers() {
        assertThat(names(SupplierSpecifications.isActive())).doesNotContain("Closed Cafe");
    }

    @Test
    void textMatchesNameBuildingOrDescriptionIgnoringCaseAndSpaces() {
        assertThat(names(SupplierSpecifications.matchesText("coffee"))).containsExactly("TOMORO COFFEE");
        assertThat(names(SupplierSpecifications.matchesText("com2"))).containsExactly("Closed Cafe", "Cool Spot");
        assertThat(names(SupplierSpecifications.matchesText("Com 2"))).containsExactly("Closed Cafe", "Cool Spot");
        assertThat(names(SupplierSpecifications.matchesText("coolspot"))).containsExactly("Cool Spot");
    }

    @Test
    void textTreatsLikeWildcardsLiterally() {
        assertThat(names(SupplierSpecifications.matchesText("100%"))).containsExactly("Octobox");
        assertThat(names(SupplierSpecifications.matchesText("%"))).containsExactly("Octobox");
    }

    @Test
    void filtersByAnyOfTheGivenCategories() {
        assertThat(names(SupplierSpecifications.inCategories(
                        List.of(SupplierCategory.COFFEE, SupplierCategory.SHOPPING))))
                .containsExactly("Closed Cafe", "Octobox", "TOMORO COFFEE");
    }

    @Test
    void openAtUsesTheHoursOfThatDay() {
        assertThat(openAt(DayOfWeek.MONDAY, "09:00")).containsExactly("Cool Spot", "Octobox", "TOMORO COFFEE");
        // TOMORO COFFEE has no hours on weekends.
        assertThat(openAt(DayOfWeek.SATURDAY, "09:00")).containsExactly("Cool Spot", "Octobox");
        assertThat(openAt(DayOfWeek.MONDAY, "21:30")).containsExactly("Octobox", "Supersnacks");
    }

    @Test
    void fullDayShopsStayOpenDuringTheFinalMinute() {
        assertThat(openAt(DayOfWeek.MONDAY, "00:00")).contains("Octobox");
        assertThat(openAt(DayOfWeek.MONDAY, "23:59")).contains("Octobox");
        assertThat(openAt(DayOfWeek.SUNDAY, "23:59:59")).contains("Octobox");
    }

    @Test
    void lateClosingShopsStillCloseAtTheirScheduledTime() {
        repository.save(supplier(
                "Late Cafe", SupplierCategory.FOOD, "COM2", null, List.of(DayOfWeek.MONDAY), "09:00", "23:59", true));
        assertThat(openAt(DayOfWeek.MONDAY, "23:58")).contains("Late Cafe");
        assertThat(openAt(DayOfWeek.MONDAY, "23:59")).doesNotContain("Late Cafe");
        assertThat(openAt(DayOfWeek.TUESDAY, "00:00")).doesNotContain("Late Cafe");
    }

    @Test
    void openAtIncludesHoursRunningPastMidnightFromThePreviousDay() {
        assertThat(openAt(DayOfWeek.TUESDAY, "01:30")).containsExactly("Octobox", "Supersnacks");
        assertThat(openAt(DayOfWeek.TUESDAY, "02:00")).containsExactly("Octobox");
    }

    @Test
    void overnightHoursOnlyCarryIntoTheNextDayWhenThePreviousDayOpened() {
        var lateNight = supplier(
                "Late Prata", SupplierCategory.FOOD, "UTown", null, List.of(DayOfWeek.FRIDAY), "18:00", "03:00", true);
        repository.save(lateNight);
        assertThat(openAt(DayOfWeek.SATURDAY, "01:00")).contains("Late Prata");
        assertThat(openAt(DayOfWeek.SUNDAY, "01:00")).doesNotContain("Late Prata");
    }

    @Test
    void replacingHoursUpdatesExistingDaysWithoutBreakingTheOneRowPerDayRule() {
        var supplier = repository
                .findAll(SupplierSpecifications.matchesText("Cool Spot"), Sort.unsorted())
                .getFirst();
        supplier.replaceOpeningHours(List.of(
                hours(DayOfWeek.MONDAY, "10:00", "20:00"),
                hours(DayOfWeek.FRIDAY, "18:00", "02:00"),
                hours(DayOfWeek.SUNDAY, "12:00", "16:00")));
        repository.saveAndFlush(supplier);

        var saved = repository.findById(supplier.getId()).orElseThrow();
        assertThat(saved.getOpeningHours())
                .extracting(SupplierOpeningHours::getDayOfWeek, entry -> entry.getOpensAt()
                        .toString())
                .containsExactly(
                        Tuple.tuple(DayOfWeek.MONDAY, "10:00"),
                        Tuple.tuple(DayOfWeek.FRIDAY, "18:00"),
                        Tuple.tuple(DayOfWeek.SUNDAY, "12:00"));
    }

    private static SupplierOpeningHours hours(DayOfWeek day, String opensAt, String closesAt) {
        return SupplierOpeningHours.builder()
                .dayOfWeek(day)
                .opensAt(LocalTime.parse(opensAt))
                .closesAt(LocalTime.parse(closesAt))
                .build();
    }

    @Test
    void filtersCombineWithAnd() {
        var spec = Specification.allOf(
                SupplierSpecifications.isActive(),
                SupplierSpecifications.inCategories(List.of(SupplierCategory.FOOD)),
                SupplierSpecifications.openAt(DayOfWeek.WEDNESDAY, LocalTime.of(23, 0)));
        assertThat(names(spec)).containsExactly("Supersnacks");
    }
}
