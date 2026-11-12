/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-09-28
 * Scope: Generated initial Supplier Service implementation and tests.
 */

package com.campuscouriers.supplier.repository;
import com.campuscouriers.supplier.entity.Building;
import com.campuscouriers.supplier.entity.BuildingStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@Testcontainers
class BuildingRepositoryTest {

    @Container
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");

    @DynamicPropertySource
    static void configureDatabase(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired
    private BuildingRepository buildingRepository;

    @Test
    void findAllByStatusOrderByNormalizedNameAsc_returnsOnlyActiveBuildingsAlphabetically() {
        buildingRepository.saveAndFlush(new Building("COM3", "com3"));
        buildingRepository.saveAndFlush(new Building("Central Library", "central library"));
        Building retired = new Building("Old Building", "old building");
        ReflectionTestUtils.setField(retired, "status", BuildingStatus.RETIRED);
        buildingRepository.saveAndFlush(retired);

        assertThat(buildingRepository.findAllByStatusOrderByNormalizedNameAsc(BuildingStatus.ACTIVE))
                .extracting(Building::getName)
                .containsExactly("Central Library", "COM3");
    }

    @Test
    void findByNormalizedName_findsPersistedBuilding() {
        buildingRepository.saveAndFlush(new Building("COM3", "com3"));

        assertThat(buildingRepository.findByNormalizedName("com3"))
                .get()
                .extracting(Building::getName)
                .isEqualTo("COM3");
    }

    @Test
    void normalizedNameUniqueConstraint_rejectsDuplicate() {
        buildingRepository.saveAndFlush(new Building("COM3", "com3"));

        assertThatThrownBy(() -> buildingRepository.saveAndFlush(new Building("com3", "com3")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
