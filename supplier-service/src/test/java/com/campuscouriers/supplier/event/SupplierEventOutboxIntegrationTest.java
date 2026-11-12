/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
 * Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.supplier.event;

import com.campuscouriers.supplier.dto.CreateSupplierRequest;
import com.campuscouriers.supplier.dto.SupplierResponse;
import com.campuscouriers.supplier.dto.UpdateSupplierRequest;
import com.campuscouriers.supplier.entity.Building;
import com.campuscouriers.supplier.entity.Category;
import com.campuscouriers.supplier.entity.OutboxEvent;
import com.campuscouriers.supplier.exception.DuplicateSupplierException;
import com.campuscouriers.supplier.repository.BuildingRepository;
import com.campuscouriers.supplier.repository.CategoryRepository;
import com.campuscouriers.supplier.repository.OutboxEventRepository;
import com.campuscouriers.supplier.repository.SupplierRepository;
import com.campuscouriers.supplier.service.SupplierService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

// Runs against real PostgreSQL to check what Debezium will relay: exactly the outbox rows of committed changes,
// in the column layout its Outbox Event Router expects
@SpringBootTest
@Testcontainers
class SupplierEventOutboxIntegrationTest {

    @Container
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired private SupplierService supplierService;
    @Autowired private SupplierRepository supplierRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private BuildingRepository buildingRepository;
    @Autowired private OutboxEventRepository outboxEventRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    private final JsonMapper jsonMapper = JsonMapper.builder().build();
    private Category category;
    private Building building;

    @BeforeEach
    void setUp() {
        category = categoryRepository.saveAndFlush(new Category("Food", "food"));
        building = buildingRepository.saveAndFlush(new Building("COM3", "com3"));
    }

    @AfterEach
    void cleanUp() {
        outboxEventRepository.deleteAll();
        supplierRepository.deleteAll();
        categoryRepository.deleteAll();
        buildingRepository.deleteAll();
    }

    @Test
    void create_storesSupplierCreatedEventKeyedBySupplierIdWithSnapshotPayload() {
        SupplierResponse created = supplierService.create(createRequest("Coffee Bean"));

        List<OutboxEvent> events = outboxEventRepository.findByAggregateId(created.id().toString());
        assertThat(events).extracting(OutboxEvent::getAggregateType, OutboxEvent::getType)
                .containsExactly(tuple("supplier", "supplier.created"));

        // Read back from the jsonb column, as Debezium sees it
        JsonNode payload = jsonMapper.readTree(jdbcTemplate.queryForObject(
                "select payload::text from outbox where id = ?", String.class, events.get(0).getId()));
        assertThat(payload.get("supplierId").asString()).isEqualTo(created.id().toString());
        assertThat(payload.get("name").asString()).isEqualTo("Coffee Bean");
        assertThat(payload.get("categoryId").asString()).isEqualTo(category.getId().toString());
        assertThat(payload.get("categoryName").asString()).isEqualTo("Food");
        assertThat(payload.get("buildingId").asString()).isEqualTo(building.getId().toString());
        assertThat(payload.get("buildingName").asString()).isEqualTo("COM3");
        assertThat(payload.get("openingTime").asString()).isEqualTo("09:00:00");
        assertThat(payload.get("status").asString()).isEqualTo("ACTIVE");
    }

    @Test
    void update_storesSupplierUpdatedEventAfterCreatedEvent() {
        SupplierResponse created = supplierService.create(createRequest("Coffee Bean"));

        supplierService.update(created.id(), new UpdateSupplierRequest(
                "Tea House", category.getId(), building.getId(), "2", null,
                LocalTime.of(9, 0), LocalTime.of(18, 0), null));

        List<String> types = jdbcTemplate.queryForList(
                "select type from outbox where aggregateid = ? order by created_at", String.class,
                created.id().toString());
        assertThat(types).containsExactly("supplier.created", "supplier.updated");
    }

    @Test
    void create_duplicateBranch_storesNoEvent() {
        supplierService.create(createRequest("Coffee Bean"));

        assertThatThrownBy(() -> supplierService.create(createRequest("COFFEE BEAN")))
                .isInstanceOf(DuplicateSupplierException.class);

        assertThat(outboxEventRepository.count()).isEqualTo(1);
    }

    private CreateSupplierRequest createRequest(String name) {
        return new CreateSupplierRequest(name, category.getId(), building.getId(), "1", null,
                LocalTime.of(9, 0), LocalTime.of(18, 0), null);
    }

}
