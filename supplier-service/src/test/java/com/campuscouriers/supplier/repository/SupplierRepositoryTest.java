/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-09-28
 * Scope: Generated initial Supplier Service implementation and tests.
 */

package com.campuscouriers.supplier.repository;
import com.campuscouriers.supplier.entity.Building;
import com.campuscouriers.supplier.entity.Category;
import com.campuscouriers.supplier.entity.Supplier;
import com.campuscouriers.supplier.entity.SupplierStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@Testcontainers
class SupplierRepositoryTest {

    @Container
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");

    @DynamicPropertySource
    static void configureDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired
    private SupplierRepository supplierRepository;
    @Autowired
    private CategoryRepository categoryRepository;
    @Autowired
    private BuildingRepository buildingRepository;

    private Category category;
    private Building building;

    @BeforeEach
    void setUp() {
        category = categoryRepository.saveAndFlush(new Category("Food", "food"));
        building = buildingRepository.saveAndFlush(new Building("COM3", "com3"));
    }

    @Test
    void specifications_applyActiveSearchCategoryAndBuildingFilters() {
        supplierRepository.saveAndFlush(supplier("Coffee Bean", "coffee bean", "1", "1"));
        supplierRepository.saveAndFlush(supplier("Tea House", "tea house", "1", "1"));
        Supplier inactive = supplier("Old Coffee", "old coffee", "1", "1");
        ReflectionTestUtils.setField(inactive, "status", SupplierStatus.INACTIVE);
        supplierRepository.saveAndFlush(inactive);

        Specification<Supplier> filters = Specification
                .where(SupplierSpecifications.hasStatus(SupplierStatus.ACTIVE))
                .and(SupplierSpecifications.nameContains("COFFEE"))
                .and(SupplierSpecifications.hasCategory(category.getId()))
                .and(SupplierSpecifications.hasBuilding(building.getId()));

        var result = supplierRepository.findAll(
                filters, PageRequest.of(0, 20, Sort.by("name")));

        assertThat(result.getContent()).extracting(Supplier::getName)
                .containsExactly("Coffee Bean");
        assertThat(result.getTotalElements()).isEqualTo(1);
    }

    @Test
    void existsByBranchIdentity_findsPersistedSupplier() {
        supplierRepository.saveAndFlush(supplier("Coffee Bean", "coffee bean", "1", "1"));

        assertThat(supplierRepository.existsByNormalizedNameAndBuildingId(
                "coffee bean", building.getId())).isTrue();
    }

    @Test
    void existsByBranchIdentityExcludingId_ignoresSupplierBeingUpdated() {
        Supplier saved = supplierRepository.saveAndFlush(
                supplier("Coffee Bean", "coffee bean", "1", "1"));

        assertThat(supplierRepository.existsByNormalizedNameAndBuildingIdAndIdNot(
                "coffee bean", building.getId(), saved.getId())).isFalse();
    }

    @Test
    void findByIdAndStatus_returnsOnlyMatchingStatus() {
        Supplier saved = supplierRepository.saveAndFlush(
                supplier("Coffee Bean", "coffee bean", "1", "1"));

        assertThat(supplierRepository.findByIdAndStatus(saved.getId(), SupplierStatus.ACTIVE))
                .isPresent();
        assertThat(supplierRepository.findByIdAndStatus(saved.getId(), SupplierStatus.INACTIVE))
                .isEmpty();
    }

    @Test
    void branchUniqueConstraint_rejectsCaseVariantAtSameBuilding() {
        supplierRepository.saveAndFlush(supplier("Coffee Bean", "coffee bean", "1", "1"));

        assertThatThrownBy(() -> supplierRepository.saveAndFlush(
                supplier("COFFEE BEAN", "coffee bean", "1", "1")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void branchUniqueConstraint_rejectsSameNameAtDifferentFloor() {
        supplierRepository.saveAndFlush(supplier("Coffee Bean", "coffee bean", "1", "1"));

        assertThatThrownBy(() -> supplierRepository.saveAndFlush(
                supplier("Coffee Bean", "coffee bean", "2", "2")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private Supplier supplier(String name, String normalizedName, String floor, String normalizedFloor) {
        return new Supplier(
                name,
                normalizedName,
                category,
                building,
                floor,
                normalizedFloor,
                "Near the main entrance",
                LocalTime.of(9, 0),
                LocalTime.of(18, 0),
                null
        );
    }
}
