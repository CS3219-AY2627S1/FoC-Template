package com.cs3219.foc.supplier.infrastructure;

import com.cs3219.foc.supplier.model.dto.OpeningHoursDto;
import com.cs3219.foc.supplier.model.entity.SupplierCategory;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.UUID;
import lombok.With;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.MappingIterator;
import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.dataformat.csv.CsvMapper;
import tools.jackson.dataformat.csv.CsvSchema;

/** Suppliers and opening hours from the shared CSV catalog. */
public final class SupplierSeedCatalog {
    private static final String SUPPLIERS = "seed/supplier-seed-data.csv";
    private static final String OPENING_HOURS = "seed/supplier-opening-hours.csv";
    private static final CsvMapper CSV = CsvMapper.builder()
            .propertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .build();
    private static final CsvSchema HEADER = CSV.schemaWithHeader();

    private SupplierSeedCatalog() {}

    public static List<SeedSupplier> load() {
        var supplierRows = readRows(SUPPLIERS, SeedSupplier.class);
        var hourRows = readRows(OPENING_HOURS, OpeningHoursRow.class);
        var hoursBySupplier = new HashMap<UUID, List<OpeningHoursDto>>();
        for (var row : hourRows) {
            var day = DayOfWeek.of(row.dayOfWeek());
            var hours = new OpeningHoursDto(day, row.opensAt(), row.closesAt());
            var existing = hoursBySupplier.computeIfAbsent(row.supplierId(), ignored -> new ArrayList<>());
            existing.add(hours);
        }

        var suppliers = new ArrayList<SeedSupplier>();
        for (var row : supplierRows) {
            var openingHours = hoursBySupplier.getOrDefault(row.id(), List.of());
            var copiedHours = List.copyOf(openingHours);
            suppliers.add(row.withOpeningHours(copiedHours));
        }
        return List.copyOf(suppliers);
    }

    private static <T> List<T> readRows(String path, Class<T> rowType) {
        var resource = new ClassPathResource(path);
        try (var input = resource.getInputStream()) {
            var reader = CSV.readerFor(rowType).with(HEADER);
            try (MappingIterator<T> values = reader.readValues(input)) {
                return values.readAll();
            }
        } catch (IOException exception) {
            throw new UncheckedIOException("Could not read " + path, exception);
        }
    }

    record OpeningHoursRow(UUID supplierId, int dayOfWeek, LocalTime opensAt, LocalTime closesAt) {}

    public record SeedSupplier(
            UUID id,
            String name,
            SupplierCategory category,
            String building,
            String floor,
            String locationDescription,
            Double latitude,
            Double longitude,
            boolean active,
            @JsonIgnore @With List<OpeningHoursDto> openingHours) {
        public SeedSupplier {
            if (floor != null && floor.isBlank()) {
                floor = null;
            }
            if (locationDescription != null && locationDescription.isBlank()) {
                locationDescription = null;
            }
            if (openingHours == null) {
                openingHours = List.of();
            }
        }
    }
}
