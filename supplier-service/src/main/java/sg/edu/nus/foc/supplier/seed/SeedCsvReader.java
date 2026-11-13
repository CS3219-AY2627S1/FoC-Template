package sg.edu.nus.foc.supplier.seed;

import java.io.IOException;
import java.io.StringReader;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import sg.edu.nus.foc.supplier.supplier.SupplierDetails;

/**
 * Parses the supplier seed CSV (columns as in {@code data/csv/supplier-seed-data.csv}).
 * Whole-file problems throw {@link SeedFileException}; bad rows are collected, not fatal (F2.5.2).
 */
public class SeedCsvReader {

    static final List<String> REQUIRED_COLUMNS = List.of(
            "Name", "Type", "Building", "Floor", "Location Description",
            "Latitude", "Longitude", "StartingTime", "ClosingTime");
    static final String IMAGE_COLUMN = "ImageURL";
    static final String ID_COLUMN = "Id";

    private static final Pattern TIME = Pattern.compile("^(\\d{1,2}):?(\\d{2})(?:hrs)?$", Pattern.CASE_INSENSITIVE);
    private static final Pattern GITHUB_BLOB =
            Pattern.compile("^https://github\\.com/([^/]+)/([^/]+)/blob/(.+)$");
    private static final int MAX_TEXT = 200;

    public SeedFile read(Path path) {
        if (!Files.isRegularFile(path) || !Files.isReadable(path)) {
            throw new SeedFileException("Supplier seed file not found or unreadable: " + path);
        }
        String text;
        try {
            text = decode(Files.readAllBytes(path));
        } catch (IOException e) {
            throw new SeedFileException("Could not read supplier seed file " + path, e);
        }

        CSVFormat format = CSVFormat.DEFAULT.builder()
                .setHeader()
                .setSkipHeaderRecord(true)
                .setTrim(true)
                .setIgnoreEmptyLines(true)
                .get();
        try (CSVParser parser = CSVParser.parse(new StringReader(text), format)) {
            List<String> missing = REQUIRED_COLUMNS.stream().filter(c -> !parser.getHeaderMap().containsKey(c)).toList();
            if (!missing.isEmpty()) {
                throw new SeedFileException("Supplier seed file " + path + " is missing columns " + missing);
            }
            List<SeedRow> rows = new ArrayList<>();
            List<SeedRowError> errors = new ArrayList<>();
            for (CSVRecord record : parser) {
                long rowNumber = record.getRecordNumber() + 1;
                try {
                    rows.add(parseRow(record, rowNumber));
                } catch (InvalidRowException e) {
                    errors.add(new SeedRowError(rowNumber, e.getMessage()));
                }
            }
            return new SeedFile(rows, errors);
        } catch (IOException | UncheckedIOException | IllegalArgumentException | IllegalStateException e) {
            throw new SeedFileException("Supplier seed file " + path + " is malformed: " + e.getMessage(), e);
        }
    }

    /** Strict UTF-8 first; the provided file contains Windows-1252 apostrophes, so fall back to that. */
    static String decode(byte[] bytes) {
        String text;
        try {
            text = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes))
                    .toString();
        } catch (CharacterCodingException e) {
            text = new String(bytes, Charset.forName("windows-1252"));
        }
        if (text.startsWith("﻿")) {
            text = text.substring(1);
        }
        return text.replace('’', '\'').replace('‘', '\'').replace('“', '"').replace('”', '"');
    }

    private SeedRow parseRow(CSVRecord record, long rowNumber) {
        SupplierDetails details = new SupplierDetails(
                required(record, "Name"),
                required(record, "Type"),
                required(record, "Building"),
                optional(record, "Floor"),
                optional(record, "Location Description"),
                coordinate(record, "Latitude", 90),
                coordinate(record, "Longitude", 180),
                time(record, "StartingTime"),
                time(record, "ClosingTime"),
                imageUrl(optional(record, IMAGE_COLUMN)));
        return new SeedRow(rowNumber, optional(record, ID_COLUMN), details);
    }

    private static String required(CSVRecord record, String column) {
        String value = optional(record, column);
        if (value == null) {
            throw new InvalidRowException(column + " is required");
        }
        return value;
    }

    private static String optional(CSVRecord record, String column) {
        if (!record.isMapped(column) || !record.isSet(column)) {
            return null;
        }
        String value = record.get(column).strip();
        if (value.length() > MAX_TEXT) {
            throw new InvalidRowException(column + " is longer than " + MAX_TEXT + " characters");
        }
        return value.isEmpty() ? null : value;
    }

    private static double coordinate(CSVRecord record, String column, double limit) {
        String raw = required(record, column);
        double value;
        try {
            value = Double.parseDouble(raw);
        } catch (NumberFormatException e) {
            throw new InvalidRowException(column + " '" + raw + "' is not a number");
        }
        if (!Double.isFinite(value) || value < -limit || value > limit) {
            throw new InvalidRowException(column + " " + raw + " is out of range");
        }
        return value;
    }

    /** Accepts "0900hrs" (seed format), "0900" and "09:00". */
    static LocalTime time(CSVRecord record, String column) {
        String raw = required(record, column);
        Matcher m = TIME.matcher(raw);
        if (!m.matches()) {
            throw new InvalidRowException(column + " '" + raw + "' is not a time like 0900hrs");
        }
        int hour = Integer.parseInt(m.group(1));
        int minute = Integer.parseInt(m.group(2));
        if (hour > 23 || minute > 59) {
            throw new InvalidRowException(column + " '" + raw + "' is not a valid time");
        }
        return LocalTime.of(hour, minute);
    }

    /** Seed images are GitHub page links; rewrite them to the raw file so browsers can display them. */
    static String imageUrl(String raw) {
        if (raw == null) {
            return null;
        }
        Matcher blob = GITHUB_BLOB.matcher(raw);
        String url = blob.matches()
                ? "https://raw.githubusercontent.com/" + blob.group(1) + "/" + blob.group(2) + "/" + blob.group(3)
                : raw;
        try {
            URI uri = new URI(url);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!scheme.equals("https") && !scheme.equals("http") || uri.getHost() == null) {
                throw new InvalidRowException("ImageURL '" + raw + "' is not an http(s) URL");
            }
        } catch (URISyntaxException e) {
            throw new InvalidRowException("ImageURL '" + raw + "' is not a valid URL");
        }
        return url;
    }

    static final class InvalidRowException extends RuntimeException {
        InvalidRowException(String message) {
            super(message);
        }
    }
}
