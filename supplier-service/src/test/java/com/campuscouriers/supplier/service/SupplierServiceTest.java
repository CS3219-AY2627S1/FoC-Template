/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
 * Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-10-02
 * Scope: Generated service tests for supplier creation, retrieval, update, and lifecycle.
 */
package com.campuscouriers.supplier.service;

import com.campuscouriers.supplier.dto.CreateSupplierRequest;
import com.campuscouriers.supplier.dto.UpdateSupplierRequest;
import com.campuscouriers.supplier.entity.Building;
import com.campuscouriers.supplier.entity.Category;
import com.campuscouriers.supplier.entity.Supplier;
import com.campuscouriers.supplier.entity.SupplierStatus;
import com.campuscouriers.supplier.event.SupplierEventPublisher;
import com.campuscouriers.supplier.exception.DuplicateSupplierException;
import com.campuscouriers.supplier.exception.ReferenceNotFoundException;
import com.campuscouriers.supplier.exception.InactiveReferencesException;
import com.campuscouriers.supplier.repository.BuildingRepository;
import com.campuscouriers.supplier.repository.CategoryRepository;
import com.campuscouriers.supplier.repository.SupplierRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.mockito.ArgumentMatchers;

import java.time.LocalTime;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SupplierServiceTest {

    @Mock
    private SupplierRepository supplierRepository;
    @Mock
    private CategoryRepository categoryRepository;
    @Mock
    private BuildingRepository buildingRepository;
    @Mock
    private SupplierEventPublisher supplierEventPublisher;

    @InjectMocks
    private SupplierService supplierService;

    private UUID categoryId;
    private UUID buildingId;
    private Category category;
    private Building building;

    @BeforeEach
    void setUp() {
        categoryId = UUID.randomUUID();
        buildingId = UUID.randomUUID();
        category = new Category("Food", "food");
        building = new Building("COM3", "com3");
        ReflectionTestUtils.setField(category, "id", categoryId);
        ReflectionTestUtils.setField(building, "id", buildingId);
    }

    @Test
    void findActive_withoutOptionalFilters_returnsPage() {
        when(supplierRepository.findAll(
                ArgumentMatchers.<Specification<Supplier>>any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(java.util.List.of()));

        var response = supplierService.findActive(null, null, null, 0, 20, "name,asc");

        assertThat(response.items()).isEmpty();
        verify(supplierRepository).findAll(
                ArgumentMatchers.<Specification<Supplier>>any(), any(Pageable.class));
    }

    @Test
    void findDeactivated_returnsPage() {
        when(supplierRepository.findAll(
                ArgumentMatchers.<Specification<Supplier>>any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(java.util.List.of()));

        var response = supplierService.findDeactivated(null, null, null, 0, 20, "name,asc");

        assertThat(response.items()).isEmpty();
        verify(supplierRepository).findAll(
                ArgumentMatchers.<Specification<Supplier>>any(), any(Pageable.class));
    }

    @Test
    void findActive_returnsMappedPageWithRequestedPaginationAndSort() {
        Supplier supplier = new Supplier(
                "Coffee Bean", "coffee bean", category, building, "1", "1",
                "Near the entrance", LocalTime.of(9, 0), LocalTime.of(18, 0), null);
        when(supplierRepository.findAll(
                ArgumentMatchers.<Specification<Supplier>>any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(java.util.List.of(supplier)));

        var response = supplierService.findActive(
                "coffee", categoryId, buildingId, 0, 10, "name,desc");

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(supplierRepository).findAll(
                ArgumentMatchers.<Specification<Supplier>>any(), pageableCaptor.capture());
        assertThat(response.items()).extracting(item -> item.name()).containsExactly("Coffee Bean");
        assertThat(pageableCaptor.getValue().getPageSize()).isEqualTo(10);
        assertThat(pageableCaptor.getValue().getSort().getOrderFor("normalizedName").isDescending()).isTrue();
    }

    @Test
    void create_validRequest_normalizesAndPersistsActiveSupplier() {
        when(categoryRepository.findById(categoryId)).thenReturn(Optional.of(category));
        when(buildingRepository.findById(buildingId)).thenReturn(Optional.of(building));
        when(supplierRepository.saveAndFlush(any(Supplier.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = supplierService.create(validRequest("  Coffee   Bean  ", "  Level   1 "));

        ArgumentCaptor<Supplier> captor = ArgumentCaptor.forClass(Supplier.class);
        verify(supplierRepository).existsByNormalizedNameAndBuildingId(
                "coffee bean", buildingId);
        verify(supplierRepository).saveAndFlush(captor.capture());
        Supplier saved = captor.getValue();
        assertThat(saved.getName()).isEqualTo("Coffee Bean");
        assertThat(saved.getFloor()).isEqualTo("Level 1");
        assertThat(saved.getStatus()).isEqualTo(SupplierStatus.ACTIVE);
        assertThat(response.category().id()).isEqualTo(categoryId);
        assertThat(response.building().id()).isEqualTo(buildingId);
        verify(supplierEventPublisher).publishSupplierCreated(saved);
    }

    @Test
    void create_whenCategoryAndBuildingAreRetired_reportsBoth() {
        category.deactivate();
        building.deactivate();
        when(categoryRepository.findById(categoryId)).thenReturn(Optional.of(category));
        when(buildingRepository.findById(buildingId)).thenReturn(Optional.of(building));

        assertThatThrownBy(() -> supplierService.create(validRequest("Coffee Bean", "1")))
                .isInstanceOfSatisfying(InactiveReferencesException.class, exception ->
                        assertThat(exception.getInactiveReferences())
                                .containsExactly("category", "building"));

        verify(supplierRepository, never()).saveAndFlush(any());
    }

    @Test
    void create_missingCategory_throwsAndDoesNotSave() {
        when(categoryRepository.findById(categoryId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> supplierService.create(validRequest("Coffee Bean", "1")))
                .isInstanceOf(ReferenceNotFoundException.class);

        verify(buildingRepository, never()).findById(any());
        verify(supplierRepository, never()).saveAndFlush(any());
        verifyNoInteractions(supplierEventPublisher);
    }

    @Test
    void create_duplicateBranch_throwsAndDoesNotSave() {
        when(categoryRepository.findById(categoryId)).thenReturn(Optional.of(category));
        when(buildingRepository.findById(buildingId)).thenReturn(Optional.of(building));
        when(supplierRepository.existsByNormalizedNameAndBuildingId(
                "coffee bean", buildingId)).thenReturn(true);

        assertThatThrownBy(() -> supplierService.create(validRequest("COFFEE BEAN", "1")))
                .isInstanceOf(DuplicateSupplierException.class);

        verify(supplierRepository, never()).saveAndFlush(any());
        verifyNoInteractions(supplierEventPublisher);
    }

    @Test
    void findActiveById_existingActiveSupplier_returnsResponse() {
        UUID supplierId = UUID.randomUUID();
        Supplier supplier = supplier("Coffee Bean", category, building);
        ReflectionTestUtils.setField(supplier, "id", supplierId);
        when(supplierRepository.findByIdAndStatus(supplierId, SupplierStatus.ACTIVE))
                .thenReturn(Optional.of(supplier));

        var response = supplierService.findActiveById(supplierId);

        assertThat(response.id()).isEqualTo(supplierId);
        assertThat(response.name()).isEqualTo("Coffee Bean");
    }

    @Test
    void findActiveById_unknownOrInactiveSupplier_throwsNotFound() {
        UUID supplierId = UUID.randomUUID();
        when(supplierRepository.findByIdAndStatus(supplierId, SupplierStatus.ACTIVE))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> supplierService.findActiveById(supplierId))
                .isInstanceOf(ReferenceNotFoundException.class);
    }

    @Test
    void update_validRequest_replacesEditableFieldsAndPreservesIdentityAndStatus() {
        UUID supplierId = UUID.randomUUID();
        Supplier supplier = supplier("Old Name", category, building);
        ReflectionTestUtils.setField(supplier, "id", supplierId);
        Category newCategory = new Category("Retail", "retail");
        Building newBuilding = new Building("COM2", "com2");
        UUID newCategoryId = UUID.randomUUID();
        UUID newBuildingId = UUID.randomUUID();
        ReflectionTestUtils.setField(newCategory, "id", newCategoryId);
        ReflectionTestUtils.setField(newBuilding, "id", newBuildingId);
        when(supplierRepository.findById(supplierId)).thenReturn(Optional.of(supplier));
        when(categoryRepository.findById(newCategoryId)).thenReturn(Optional.of(newCategory));
        when(buildingRepository.findById(newBuildingId)).thenReturn(Optional.of(newBuilding));
        when(supplierRepository.saveAndFlush(supplier)).thenReturn(supplier);

        var response = supplierService.update(supplierId, new UpdateSupplierRequest(
                "  New   Name ", newCategoryId, newBuildingId, "  Level  2 ",
                " Updated description ", LocalTime.of(10, 0), LocalTime.of(20, 0), null));

        verify(supplierRepository).existsByNormalizedNameAndBuildingIdAndIdNot(
                "new name", newBuildingId, supplierId);
        assertThat(response.id()).isEqualTo(supplierId);
        assertThat(supplier.getName()).isEqualTo("New Name");
        assertThat(supplier.getFloor()).isEqualTo("Level 2");
        assertThat(supplier.getCategory()).isSameAs(newCategory);
        assertThat(supplier.getBuilding()).isSameAs(newBuilding);
        assertThat(supplier.getStatus()).isEqualTo(SupplierStatus.ACTIVE);
        verify(supplierEventPublisher).publishSupplierUpdated(supplier);
    }

    @Test
    void update_whenCategoryAndBuildingAreRetired_reportsBoth() {
        UUID supplierId = UUID.randomUUID();
        Supplier supplier = supplier("Coffee Bean", category, building);
        category.deactivate();
        building.deactivate();
        when(supplierRepository.findById(supplierId)).thenReturn(Optional.of(supplier));
        when(categoryRepository.findById(categoryId)).thenReturn(Optional.of(category));
        when(buildingRepository.findById(buildingId)).thenReturn(Optional.of(building));

        assertThatThrownBy(() -> supplierService.update(supplierId, updateRequest("Coffee Bean")))
                .isInstanceOfSatisfying(InactiveReferencesException.class, exception ->
                        assertThat(exception.getInactiveReferences())
                                .containsExactly("category", "building"));

        verify(supplierRepository, never()).saveAndFlush(any());
    }

    @Test
    void update_duplicateOtherSupplier_throwsAndDoesNotSave() {
        UUID supplierId = UUID.randomUUID();
        Supplier supplier = supplier("Old Name", category, building);
        when(supplierRepository.findById(supplierId)).thenReturn(Optional.of(supplier));
        when(categoryRepository.findById(categoryId)).thenReturn(Optional.of(category));
        when(buildingRepository.findById(buildingId)).thenReturn(Optional.of(building));
        when(supplierRepository.existsByNormalizedNameAndBuildingIdAndIdNot(
                "coffee bean", buildingId, supplierId)).thenReturn(true);

        assertThatThrownBy(() -> supplierService.update(supplierId, updateRequest("Coffee Bean")))
                .isInstanceOf(DuplicateSupplierException.class);

        verify(supplierRepository, never()).saveAndFlush(any());
        verifyNoInteractions(supplierEventPublisher);
    }

    @Test
    void deactivate_existingSupplier_marksItInactiveAndReturnsUpdatedResponse() {
        UUID supplierId = UUID.randomUUID();
        Supplier supplier = supplier("Coffee Bean", category, building);
        ReflectionTestUtils.setField(supplier, "id", supplierId);
        when(supplierRepository.findById(supplierId)).thenReturn(Optional.of(supplier));
        when(supplierRepository.saveAndFlush(supplier)).thenReturn(supplier);

        var response = supplierService.deactivate(supplierId);

        assertThat(supplier.getStatus()).isEqualTo(SupplierStatus.INACTIVE);
        assertThat(response.status()).isEqualTo(SupplierStatus.INACTIVE);
        verify(supplierRepository).saveAndFlush(supplier);
    }

    @Test
    void deactivate_unknownSupplier_throwsAndDoesNotSave() {
        UUID supplierId = UUID.randomUUID();
        when(supplierRepository.findById(supplierId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> supplierService.deactivate(supplierId))
                .isInstanceOf(ReferenceNotFoundException.class);

        verify(supplierRepository, never()).saveAndFlush(any());
    }

    @Test
    void reactivate_inactiveSupplier_marksItActiveAndReturnsUpdatedResponse() {
        UUID supplierId = UUID.randomUUID();
        Supplier supplier = supplier("Coffee Bean", category, building);
        ReflectionTestUtils.setField(supplier, "id", supplierId);
        supplier.deactivate();
        when(supplierRepository.findById(supplierId)).thenReturn(Optional.of(supplier));
        when(supplierRepository.saveAndFlush(supplier)).thenReturn(supplier);

        var response = supplierService.reactivate(supplierId);

        assertThat(supplier.getStatus()).isEqualTo(SupplierStatus.ACTIVE);
        assertThat(response.status()).isEqualTo(SupplierStatus.ACTIVE);
        verify(supplierRepository).saveAndFlush(supplier);
    }

    @Test
    void reactivate_unknownSupplier_throwsAndDoesNotSave() {
        UUID supplierId = UUID.randomUUID();
        when(supplierRepository.findById(supplierId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> supplierService.reactivate(supplierId))
                .isInstanceOf(ReferenceNotFoundException.class);

        verify(supplierRepository, never()).saveAndFlush(any());
    }

    @Test
    void reactivate_whenCategoryIsRetired_throwsAndLeavesSupplierInactive() {
        UUID supplierId = UUID.randomUUID();
        Category retiredCategory = new Category("Old Food", "old food");
        retiredCategory.deactivate();
        Supplier supplier = supplier("Coffee Bean", retiredCategory, building);
        supplier.deactivate();
        when(supplierRepository.findById(supplierId)).thenReturn(Optional.of(supplier));

        assertThatThrownBy(() -> supplierService.reactivate(supplierId))
                .isInstanceOf(InactiveReferencesException.class)
                .hasMessage("The following selected references are not active: category");

        assertThat(supplier.getStatus()).isEqualTo(SupplierStatus.INACTIVE);
        verify(supplierRepository, never()).saveAndFlush(any());
    }

    @Test
    void reactivate_whenBuildingIsRetired_throwsAndLeavesSupplierInactive() {
        UUID supplierId = UUID.randomUUID();
        Building retiredBuilding = new Building("Old Block", "old block");
        retiredBuilding.deactivate();
        Supplier supplier = supplier("Coffee Bean", category, retiredBuilding);
        supplier.deactivate();
        when(supplierRepository.findById(supplierId)).thenReturn(Optional.of(supplier));

        assertThatThrownBy(() -> supplierService.reactivate(supplierId))
                .isInstanceOf(InactiveReferencesException.class)
                .hasMessage("The following selected references are not active: building");

        assertThat(supplier.getStatus()).isEqualTo(SupplierStatus.INACTIVE);
        verify(supplierRepository, never()).saveAndFlush(any());
    }

    @Test
    void reactivate_whenCategoryAndBuildingAreRetired_reportsBothAndLeavesSupplierInactive() {
        UUID supplierId = UUID.randomUUID();
        Category retiredCategory = new Category("Old Food", "old food");
        Building retiredBuilding = new Building("Old Block", "old block");
        retiredCategory.deactivate();
        retiredBuilding.deactivate();
        Supplier supplier = supplier("Coffee Bean", retiredCategory, retiredBuilding);
        supplier.deactivate();
        when(supplierRepository.findById(supplierId)).thenReturn(Optional.of(supplier));

        assertThatThrownBy(() -> supplierService.reactivate(supplierId))
                .isInstanceOfSatisfying(InactiveReferencesException.class, exception ->
                        assertThat(exception.getInactiveReferences())
                                .containsExactly("category", "building"));

        assertThat(supplier.getStatus()).isEqualTo(SupplierStatus.INACTIVE);
        verify(supplierRepository, never()).saveAndFlush(any());
    }

    private Supplier supplier(String name, Category supplierCategory, Building supplierBuilding) {
        return new Supplier(
                name, name.toLowerCase(Locale.ROOT), supplierCategory, supplierBuilding,
                "1", "1", "Description", LocalTime.of(9, 0), LocalTime.of(18, 0), null);
    }

    private UpdateSupplierRequest updateRequest(String name) {
        return new UpdateSupplierRequest(
                name, categoryId, buildingId, "1", "Description",
                LocalTime.of(9, 0), LocalTime.of(18, 0), null);
    }

    private CreateSupplierRequest validRequest(String name, String floor) {
        return new CreateSupplierRequest(
                name,
                categoryId,
                buildingId,
                floor,
                "Near the main entrance",
                LocalTime.of(9, 0),
                LocalTime.of(18, 0),
                "https://example.com/image.jpg"
        );
    }
}
