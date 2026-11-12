/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-01
 * Scope: Generated seed CSV parsing tests and edge cases.
 */
package com.campuscouriers.supplier.importer;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import java.nio.charset.StandardCharsets;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SupplierSeedCsvReaderTest {

    private static final String HEADER = String.join(",", SupplierSeedCsvReader.HEADERS) + "\n";
    private final SupplierSeedCsvReader reader = new SupplierSeedCsvReader();

    @Test
    void read_parsesTimesBlanksAndQuotedCommas() {
        var rows = reader.read(csv(
                "  Test   Shop  ,Food,COM2,,\"Near stairs, beside lift\",1,2,0000hrs,2359hrs,\n"));

        assertThat(rows).hasSize(1);
        SupplierSeedRow row = rows.get(0);
        assertThat(row.rowNumber()).isEqualTo(2);
        assertThat(row.name()).isEqualTo("Test Shop");
        assertThat(row.floor()).isNull();
        assertThat(row.description()).isEqualTo("Near stairs, beside lift");
        assertThat(row.openingTime()).isEqualTo(LocalTime.MIDNIGHT);
        assertThat(row.closingTime()).isEqualTo(LocalTime.of(23, 59));
        assertThat(row.imageUrl()).isNull();
    }

    @Test
    void read_invalidTimeReportsRowAndField() {
        assertThatThrownBy(() -> reader.read(csv(
                "Shop,Food,COM2,1,Here,1,2,2400hrs,1800hrs,\n")))
                .isInstanceOf(SupplierSeedImportException.class)
                .hasMessageContaining("CSV row 2")
                .hasMessageContaining("StartingTime");
    }

    @Test
    void read_wrongHeadersFailsBeforeImport() {
        assertThatThrownBy(() -> reader.read(csv("Name,Type\nShop,Food\n", false)))
                .isInstanceOf(SupplierSeedImportException.class)
                .hasMessageContaining("expected headers");
    }

    private ByteArrayResource csv(String row) {
        return csv(HEADER + row, false);
    }

    private ByteArrayResource csv(String content, boolean ignored) {
        return new ByteArrayResource(content.getBytes(StandardCharsets.UTF_8));
    }
}
