package sg.edu.nus.foc.supplier.seed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalTime;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SeedCsvReaderTest {

    private static final String HEADER =
            "Name,Type,Building,Floor,Location Description,Latitude,Longitude,StartingTime,ClosingTime,ImageURL\n";

    @TempDir
    Path dir;

    private final SeedCsvReader reader = new SeedCsvReader();

    private Path write(String content, Charset charset) throws IOException {
        Path file = dir.resolve("seed.csv");
        Files.write(file, content.getBytes(charset));
        return file;
    }

    @Test
    void readsTheProvidedSeedFile() {
        // The course-provided file, unchanged; data/csv/ extends it.
        SeedFile file = reader.read(Path.of("src/test/resources/seed/provided-supplier-seed-data.csv"));
        assertThat(file.errors()).isEmpty();
        assertThat(file.rows()).hasSize(21);
        assertThat(file.rows()).anySatisfy(row -> {
            assertThat(row.details().name()).isEqualTo("Octobox");
            // The file stores this apostrophe as a Windows-1252 byte.
            assertThat(row.details().building()).isEqualTo("Prince George's Park");
        });
    }

    @Test
    void readsTheCampusSeedFileWithEveryProvidedRow() {
        SeedFile campus = reader.read(Path.of("../data/csv/supplier-seed-data.csv"));
        SeedFile provided = reader.read(Path.of("src/test/resources/seed/provided-supplier-seed-data.csv"));
        assertThat(campus.errors()).isEmpty();
        assertThat(campus.rows()).hasSizeGreaterThanOrEqualTo(100);
        // Same details, so the records already in each environment keep their seed keys.
        assertThat(campus.rows().stream().map(SeedRow::details).toList())
                .containsAll(provided.rows().stream().map(SeedRow::details).toList());
        assertThat(campus.rows().stream().map(row -> row.details().naturalKey()).toList()).doesNotHaveDuplicates();
    }

    @Test
    void parsesFieldsAndNormalisesImagesAndTimes() throws IOException {
        Path csv = write(HEADER + "Supersnacks,Food,PGP,1,\"Block 10, level 1\",1.2913,103.7776,1100hrs,0200hrs,"
                + "https://github.com/org/repo/blob/main/data/images/S.jpeg\n", StandardCharsets.UTF_8);
        SeedRow row = reader.read(csv).rows().getFirst();
        assertThat(row.rowNumber()).isEqualTo(2);
        assertThat(row.id()).isNull();
        assertThat(row.details().locationDescription()).isEqualTo("Block 10, level 1");
        assertThat(row.details().openingTime()).isEqualTo(LocalTime.of(11, 0));
        assertThat(row.details().closingTime()).isEqualTo(LocalTime.of(2, 0));
        assertThat(row.details().imageUrl())
                .isEqualTo("https://raw.githubusercontent.com/org/repo/main/data/images/S.jpeg");
    }

    @Test
    void decodesWindows1252AndUtf8WithBom() throws IOException {
        Path cp1252 = write(HEADER + "Octobox,Shopping,Prince George’s Park,2,,1.29,103.77,0000hrs,2359hrs,\n",
                Charset.forName("windows-1252"));
        assertThat(reader.read(cp1252).rows().getFirst().details().building()).isEqualTo("Prince George's Park");

        Path bom = write("﻿" + HEADER + "A,Food,B,1,,1,1,09:00,1800,\n", StandardCharsets.UTF_8);
        SeedRow row = reader.read(bom).rows().getFirst();
        assertThat(row.details().name()).isEqualTo("A");
        assertThat(row.details().floor()).isEqualTo("1");
        assertThat(row.details().imageUrl()).isNull();
    }

    @Test
    void invalidRowsAreSkippedWithRowNumbersAndReasons() throws IOException {
        Path csv = write(HEADER
                + "Good,Food,B,1,,1.29,103.77,0900hrs,1800hrs,\n"
                + ",Food,B,1,,1.29,103.77,0900hrs,1800hrs,\n"
                + "BadLat,Food,B,1,,north,103.77,0900hrs,1800hrs,\n"
                + "FarLat,Food,B,1,,91,103.77,0900hrs,1800hrs,\n"
                + "BadTime,Food,B,1,,1.29,103.77,9am,1800hrs,\n"
                + "LateTime,Food,B,1,,1.29,103.77,2500hrs,1800hrs,\n"
                + "BadUrl,Food,B,1,,1.29,103.77,0900hrs,1800hrs,ftp://x/y.jpg\n"
                + "Garbage,Food,B,1,,1.29,103.77,0900hrs,1800hrs,http://bad host\n"
                + "Long,Food," + "x".repeat(201) + ",1,,1.29,103.77,0900hrs,1800hrs,\n", StandardCharsets.UTF_8);
        SeedFile file = reader.read(csv);
        assertThat(file.rows()).extracting(r -> r.details().name()).containsExactly("Good");
        assertThat(file.errors()).extracting(SeedRowError::rowNumber).containsExactly(3L, 4L, 5L, 6L, 7L, 8L, 9L, 10L);
        assertThat(file.errors().getFirst().reason()).isEqualTo("Name is required");
        assertThat(file.errors().get(1).reason()).contains("not a number");
        assertThat(file.errors().get(2).reason()).contains("out of range");
        assertThat(file.errors().get(3).reason()).contains("not a time");
        assertThat(file.errors().get(4).reason()).contains("not a valid time");
        assertThat(file.errors().get(5).reason()).contains("http(s)");
        assertThat(file.errors().get(6).reason()).contains("not a valid URL");
        assertThat(file.errors().get(7).reason()).contains("longer than");
    }

    @Test
    void readsOptionalIdColumn() throws IOException {
        Path csv = write("Id,Name,Type,Building,Floor,Location Description,Latitude,Longitude,StartingTime,ClosingTime\n"
                + "abc123,A,Food,B,1,,1,1,0900hrs,1800hrs\n", StandardCharsets.UTF_8);
        assertThat(reader.read(csv).rows().getFirst().id()).isEqualTo("abc123");
    }

    @Test
    void missingFileOrColumnsOrMalformedCsvFailsTheWholeLoad() throws IOException {
        assertThatThrownBy(() -> reader.read(dir.resolve("nope.csv")))
                .isInstanceOf(SeedFileException.class).hasMessageContaining("not found");

        Path noColumns = write("Name,Type\nA,Food\n", StandardCharsets.UTF_8);
        assertThatThrownBy(() -> reader.read(noColumns))
                .isInstanceOf(SeedFileException.class).hasMessageContaining("missing columns");

        Path unterminated = write(HEADER + "\"A,Food,B,1,,1,1,0900hrs,1800hrs,\n", StandardCharsets.UTF_8);
        assertThatThrownBy(() -> reader.read(unterminated))
                .isInstanceOf(SeedFileException.class).hasMessageContaining("malformed");
    }
}
