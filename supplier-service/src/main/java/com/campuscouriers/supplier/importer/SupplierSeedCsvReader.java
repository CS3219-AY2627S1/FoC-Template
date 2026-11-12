/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-01
 * Scope: Generated and refined the CSV seed-import implementation.
 */
package com.campuscouriers.supplier.importer;

import com.campuscouriers.supplier.util.NameNormalizer;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.List;
import java.util.Set;

@Component
public class SupplierSeedCsvReader {

    static final List<String> HEADERS = List.of(
            "Name", "Type", "Building", "Floor", "Location Description",
            "Latitude", "Longitude", "StartingTime", "ClosingTime", "ImageURL");
    private static final DateTimeFormatter TIME_FORMAT =
            DateTimeFormatter.ofPattern("HHmm'hrs'").withResolverStyle(ResolverStyle.STRICT);

    public List<SupplierSeedRow> read(Resource resource) {
        try (Reader reader = new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8);
             CSVParser parser = CSVFormat.DEFAULT.builder()
                     .setHeader()
                     .setSkipHeaderRecord(true)
                     .setIgnoreEmptyLines(true)
                     .get()
                     .parse(reader)) {
            validateHeaders(parser);
            return parser.stream().map(this::toRow).toList();
        } catch (SupplierSeedImportException exception) {
            throw exception;
        } catch (IOException | IllegalArgumentException exception) {
            throw new SupplierSeedImportException(
                    "Unable to read supplier seed CSV '" + resource.getDescription() + "'", exception);
        }
    }

    private void validateHeaders(CSVParser parser) {
        List<String> actual = parser.getHeaderNames();
        if (!actual.equals(HEADERS) || !parser.getHeaderMap().keySet().equals(Set.copyOf(HEADERS))) {
            throw new SupplierSeedImportException(1,
                    "expected headers " + HEADERS + " but found " + actual);
        }
    }

    private SupplierSeedRow toRow(CSVRecord record) {
        long row = record.getRecordNumber() + 1;
        try {
            String name = required(record, "Name", row, 60);
            String category = required(record, "Type", row, 60);
            String building = required(record, "Building", row, 60);
            return new SupplierSeedRow(
                    row,
                    name,
                    category,
                    building,
                    optional(record, "Floor", row, 20),
                    optional(record, "Location Description", row, 500),
                    time(record, "StartingTime", row),
                    time(record, "ClosingTime", row),
                    optional(record, "ImageURL", row, 500));
        } catch (SupplierSeedImportException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new SupplierSeedImportException(row, "malformed CSV record: " + exception.getMessage());
        }
    }

    private String required(CSVRecord record, String field, long row, int maxLength) {
        String value = optional(record, field, row, maxLength);
        if (value == null) {
            throw new SupplierSeedImportException(row, field + " is required");
        }
        return value;
    }

    private String optional(CSVRecord record, String field, long row, int maxLength) {
        String raw = record.get(field);
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String value = NameNormalizer.displayName(raw);
        if (value.length() > maxLength) {
            throw new SupplierSeedImportException(row,
                    field + " exceeds maximum length of " + maxLength);
        }
        return value;
    }

    private LocalTime time(CSVRecord record, String field, long row) {
        String value = required(record, field, row, 7);
        try {
            return LocalTime.parse(value, TIME_FORMAT);
        } catch (DateTimeParseException exception) {
            throw new SupplierSeedImportException(row,
                    field + " must use strict HHmmhrs format (received '" + value + "')");
        }
    }
}
