/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
 * Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-01
 * Scope: Generated seed importer tests and idempotency checks.
 */
package com.campuscouriers.supplier.importer;

import com.campuscouriers.supplier.entity.Building;
import com.campuscouriers.supplier.entity.Category;
import com.campuscouriers.supplier.entity.Supplier;
import com.campuscouriers.supplier.event.SupplierEventPublisher;
import com.campuscouriers.supplier.repository.BuildingRepository;
import com.campuscouriers.supplier.repository.CategoryRepository;
import com.campuscouriers.supplier.repository.SupplierRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class SupplierSeedImporterTest {

    private final SupplierRepository suppliers = mock(SupplierRepository.class);
    private final CategoryRepository categories = mock(CategoryRepository.class);
    private final BuildingRepository buildings = mock(BuildingRepository.class);
    private final SupplierEventPublisher events = mock(SupplierEventPublisher.class);
    private final Map<String, Category> categoryStore = new HashMap<>();
    private final Map<String, Building> buildingStore = new HashMap<>();
    private final ArrayList<Supplier> supplierStore = new ArrayList<>();
    private SupplierSeedImporter importer;

    @BeforeEach
    void setUp() {
        importer = new SupplierSeedImporter(
                new SupplierSeedCsvReader(), suppliers, categories, buildings, events);
        when(categories.findByNormalizedName(any())).thenAnswer(invocation ->
                Optional.ofNullable(categoryStore.get(invocation.getArgument(0))));
        when(categories.save(any())).thenAnswer(invocation -> {
            Category value = invocation.getArgument(0);
            ReflectionTestUtils.setField(value, "id", UUID.randomUUID());
            categoryStore.put(value.getNormalizedName(), value);
            return value;
        });
        when(buildings.findByNormalizedName(any())).thenAnswer(invocation ->
                Optional.ofNullable(buildingStore.get(invocation.getArgument(0))));
        when(buildings.save(any())).thenAnswer(invocation -> {
            Building value = invocation.getArgument(0);
            ReflectionTestUtils.setField(value, "id", UUID.randomUUID());
            buildingStore.put(value.getNormalizedName(), value);
            return value;
        });
        when(suppliers.existsByNormalizedNameAndBuildingId(any(), any())).thenAnswer(invocation ->
                supplierStore.stream().anyMatch(value ->
                        value.getNormalizedName().equals(invocation.getArgument(0))
                                && value.getBuilding().getId().equals(invocation.getArgument(1))));
        when(suppliers.save(any())).thenAnswer(invocation -> {
            Supplier value = invocation.getArgument(0);
            supplierStore.add(value);
            return value;
        });
    }

    @Test
    void importCreatesReferencesReusesNormalizedNamesAndIsIdempotent() {
        ByteArrayResource csv = csv(
                "Shop One,Food,COM2,1,Here,1,2,0900hrs,1800hrs,\n"
                        + "Shop Two,Food,com2,2,There,1,2,1100hrs,0200hrs,\n");

        SupplierSeedImportSummary first = importer.importFrom(csv);
        SupplierSeedImportSummary second = importer.importFrom(csv);

        assertThat(first).isEqualTo(new SupplierSeedImportSummary(2, 2, 0, 1, 1));
        assertThat(second).isEqualTo(new SupplierSeedImportSummary(2, 0, 2, 0, 0));
        assertThat(buildingStore).containsOnlyKeys("com2");
        assertThat(buildingStore.get("com2").getName()).isEqualTo("COM2");
        assertThat(supplierStore).hasSize(2);
        // Only newly created suppliers are announced; skipped duplicates are not
        supplierStore.forEach(supplier -> verify(events).publishSupplierCreated(supplier));
        verifyNoMoreInteractions(events);
    }

    @Test
    void duplicateIdentityIgnoresCaseWhitespaceAndFloor() {
        ByteArrayResource first = csv("Test Shop,Food,COM3,1,Here,1,2,0900hrs,1800hrs,\n");
        ByteArrayResource duplicate = csv(
                "  TEST   SHOP ,Food,com3,99,Changed,1,2,1000hrs,1900hrs,\n");

        importer.importFrom(first);
        SupplierSeedImportSummary summary = importer.importFrom(duplicate);

        assertThat(summary.createdSuppliers()).isZero();
        assertThat(summary.skippedSuppliers()).isEqualTo(1);
        assertThat(supplierStore.get(0).getFloor()).isEqualTo("1");
    }

    @Test
    void differentBuildingPunctuationRemainsDistinct() {
        importer.importFrom(csv(
                "One,Food,Prince George's Park,1,Here,1,2,0900hrs,1800hrs,\n"
                        + "Two,Food,Prince George’s Park,2,There,1,2,0900hrs,1800hrs,\n"));

        assertThat(buildingStore).hasSize(2);
    }

    private ByteArrayResource csv(String rows) {
        String header = String.join(",", SupplierSeedCsvReader.HEADERS) + "\n";
        return new ByteArrayResource((header + rows).getBytes(StandardCharsets.UTF_8));
    }
}
