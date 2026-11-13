package com.friendoncampus.supplier.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.same;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

import com.friendoncampus.supplier.domain.Supplier;
import com.friendoncampus.supplier.domain.SupplierStatus;
import com.friendoncampus.supplier.repository.SupplierRepository;

class SupplierServiceTest {

    private SupplierRepository supplierRepository;
    private SupplierImageCleanup imageCleanup;
    private SupplierService supplierService;

    @BeforeEach
    void setUp() {
        supplierRepository = mock(SupplierRepository.class);
        imageCleanup = mock(SupplierImageCleanup.class);
        supplierService = new SupplierService(supplierRepository, imageCleanup);
    }

    @Test
    @SuppressWarnings("unchecked")
    void listsSuppliersUsingCombinedSpecificationAndSafePageRequest() {
        Supplier anna = supplierNamed("Anna's x Soup Union");
        Supplier heBrews = supplierNamed("he by He Brews");
        SupplierQuery query = SupplierQuery.from(
                " coffee ", " Food ", " Central Library ", "1", "2", "building,desc");
        PageRequest pageRequest = query.toPageRequest();
        Page<Supplier> repositoryPage = new PageImpl<>(
                List.of(anna, heBrews),
                pageRequest,
                5);
        when(supplierRepository.findAll(
                org.mockito.ArgumentMatchers.<Specification<Supplier>>any(),
                org.mockito.ArgumentMatchers.eq(pageRequest)))
                .thenReturn(repositoryPage);

        Page<Supplier> result = supplierService.listActiveSuppliers(query);

        assertThat(result).isSameAs(repositoryPage);
        assertThat(result.getContent()).containsExactly(anna, heBrews);
        ArgumentCaptor<Specification<Supplier>> specificationCaptor =
                ArgumentCaptor.forClass(Specification.class);
        verify(supplierRepository).findAll(
                specificationCaptor.capture(),
                org.mockito.ArgumentMatchers.eq(pageRequest));
        assertThat(specificationCaptor.getValue()).isNotNull();
    }

    @Test
    void usesDefaultPaginationAndNameOrder() {
        SupplierQuery query = SupplierQuery.from(null, null, null, null, null, null);
        PageRequest expectedPageRequest = PageRequest.of(
                0,
                20,
                Sort.by(Sort.Order.asc("name").ignoreCase().nullsLast()));
        when(supplierRepository.findAll(
                org.mockito.ArgumentMatchers.<Specification<Supplier>>any(),
                org.mockito.ArgumentMatchers.eq(expectedPageRequest)))
                .thenReturn(Page.empty(expectedPageRequest));

        Page<Supplier> result = supplierService.listActiveSuppliers(query);

        assertThat(result).isEmpty();
        verify(supplierRepository).findAll(
                org.mockito.ArgumentMatchers.<Specification<Supplier>>any(),
                org.mockito.ArgumentMatchers.eq(expectedPageRequest));
    }

    @Test
    void listsEveryStatusForAdminWhenStatusIsAbsent() {
        AdminSupplierQuery query = AdminSupplierQuery.from(
                null, null, null, null, null, null, null);
        Page<Supplier> repositoryPage = new PageImpl<>(List.of(
                supplierNamed("Active supplier"),
                supplierNamed("Inactive supplier")),
                query.supplierQuery().toPageRequest(),
                2);
        when(supplierRepository.findAll(
                org.mockito.ArgumentMatchers.<Specification<Supplier>>any(),
                org.mockito.ArgumentMatchers.eq(query.supplierQuery().toPageRequest())))
                .thenReturn(repositoryPage);

        Page<Supplier> result = supplierService.listSuppliersForAdmin(query);

        assertThat(result).isSameAs(repositoryPage);
        verify(supplierRepository).findAll(
                org.mockito.ArgumentMatchers.<Specification<Supplier>>any(),
                org.mockito.ArgumentMatchers.eq(query.supplierQuery().toPageRequest()));
    }

    @Test
    void listsOnlyRequestedStatusForAdminWithSharedFilters() {
        AdminSupplierQuery query = AdminSupplierQuery.from(
                "coffee", "Food/Coffee", "COM3", "inactive", "0", "5", "status,asc");
        when(supplierRepository.findAll(
                org.mockito.ArgumentMatchers.<Specification<Supplier>>any(),
                org.mockito.ArgumentMatchers.eq(query.supplierQuery().toPageRequest())))
                .thenReturn(Page.empty(query.supplierQuery().toPageRequest()));

        Page<Supplier> result = supplierService.listSuppliersForAdmin(query);

        assertThat(result).isEmpty();
        assertThat(query.status()).isEqualTo(SupplierStatus.INACTIVE);
        verify(supplierRepository).findAll(
                org.mockito.ArgumentMatchers.<Specification<Supplier>>any(),
                org.mockito.ArgumentMatchers.eq(query.supplierQuery().toPageRequest()));
    }

    @Test
    void retrievesSupplierById() {
        UUID id = UUID.randomUUID();
        Supplier supplier = mock(Supplier.class);
        when(supplierRepository.findById(id)).thenReturn(Optional.of(supplier));

        Supplier result = supplierService.getSupplier(id);

        assertThat(result).isSameAs(supplier);
    }

    @Test
    void retrievesInactiveSupplierById() {
        UUID id = UUID.randomUUID();
        Supplier supplier = mock(Supplier.class);
        when(supplier.getStatus()).thenReturn(SupplierStatus.INACTIVE);
        when(supplierRepository.findById(id)).thenReturn(Optional.of(supplier));

        Supplier result = supplierService.getSupplier(id);

        assertThat(result.getStatus()).isEqualTo(SupplierStatus.INACTIVE);
    }

    @Test
    void returnsDistinctActiveMetadataInCaseInsensitiveOrder() {
        when(supplierRepository.findDistinctTypesByStatus(SupplierStatus.ACTIVE))
                .thenReturn(List.of(
                        "Shopping", "Food/Coffee", "Food", "printing", "Food"));
        when(supplierRepository.findDistinctBuildingsByStatus(SupplierStatus.ACTIVE))
                .thenReturn(List.of(
                        "COM3", "Blk AS8", "central Library", "COM3"));

        SupplierMetadata metadata = supplierService.getActiveSupplierMetadata();

        assertThat(metadata.types())
                .containsExactly("Food", "Food/Coffee", "printing", "Shopping");
        assertThat(metadata.buildings())
                .containsExactly("Blk AS8", "central Library", "COM3");
        verify(supplierRepository).findDistinctTypesByStatus(SupplierStatus.ACTIVE);
        verify(supplierRepository).findDistinctBuildingsByStatus(SupplierStatus.ACTIVE);
    }

    @Test
    void returnsEmptyMetadataWhenNoActiveSuppliersExist() {
        when(supplierRepository.findDistinctTypesByStatus(SupplierStatus.ACTIVE))
                .thenReturn(List.of());
        when(supplierRepository.findDistinctBuildingsByStatus(SupplierStatus.ACTIVE))
                .thenReturn(List.of());

        SupplierMetadata metadata = supplierService.getActiveSupplierMetadata();

        assertThat(metadata.types()).isEmpty();
        assertThat(metadata.buildings()).isEmpty();
    }

    @Test
    void returnsDistinctMetadataAcrossEveryStatus() {
        when(supplierRepository.findDistinctTypes())
                .thenReturn(List.of("Shopping", "Food", "printing", "Food"));
        when(supplierRepository.findDistinctBuildings())
                .thenReturn(List.of("The Ridge", "COM3", "central Library", "COM3"));

        SupplierMetadata metadata = supplierService.getAllSupplierMetadata();

        assertThat(metadata.types()).containsExactly("Food", "printing", "Shopping");
        assertThat(metadata.buildings())
                .containsExactly("central Library", "COM3", "The Ridge");
        verify(supplierRepository).findDistinctTypes();
        verify(supplierRepository).findDistinctBuildings();
    }

    @Test
    void returnsEmptyMetadataWhenNoSuppliersExist() {
        when(supplierRepository.findDistinctTypes()).thenReturn(List.of());
        when(supplierRepository.findDistinctBuildings()).thenReturn(List.of());

        SupplierMetadata metadata = supplierService.getAllSupplierMetadata();

        assertThat(metadata.types()).isEmpty();
        assertThat(metadata.buildings()).isEmpty();
    }

    @Test
    void rejectsUnknownSupplierId() {
        UUID id = UUID.randomUUID();
        when(supplierRepository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> supplierService.getSupplier(id))
                .isInstanceOf(SupplierNotFoundException.class)
                .hasMessage("Supplier with ID " + id + " was not found")
                .extracting("supplierId")
                .isEqualTo(id);
    }

    @Test
    void createsAndPersistsSupplierFromCommand() {
        CreateSupplierCommand command = new CreateSupplierCommand(
                "New Campus Cafe",
                "Food/Coffee",
                "COM3",
                "1",
                "Beside the main entrance",
                1.2948,
                103.7716,
                LocalTime.of(8, 0),
                LocalTime.of(18, 0),
                "https://example.com/cafe.jpg",
                SupplierStatus.INACTIVE);
        when(supplierRepository.save(org.mockito.ArgumentMatchers.any(Supplier.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        Supplier result = supplierService.createSupplier(command);

        assertThat(result.getName()).isEqualTo("New Campus Cafe");
        assertThat(result.getType()).isEqualTo("Food/Coffee");
        assertThat(result.getBuilding()).isEqualTo("COM3");
        assertThat(result.getFloor()).isEqualTo("1");
        assertThat(result.getLocationDescription()).isEqualTo("Beside the main entrance");
        assertThat(result.getLatitude()).isEqualTo(1.2948);
        assertThat(result.getLongitude()).isEqualTo(103.7716);
        assertThat(result.getOpeningTime()).isEqualTo(LocalTime.of(8, 0));
        assertThat(result.getClosingTime()).isEqualTo(LocalTime.of(18, 0));
        assertThat(result.getImageUrl()).isEqualTo("https://example.com/cafe.jpg");
        assertThat(result.getStatus()).isEqualTo(SupplierStatus.INACTIVE);
        assertThat(result.getVersion()).isZero();
        verify(supplierRepository).save(same(result));
    }

    @Test
    void updatesSupplierAndFlushesManagedEntity() {
        UUID id = UUID.randomUUID();
        Supplier supplier = mock(Supplier.class);
        UpdateSupplierCommand command = updateCommand(3L);
        when(supplier.getVersion()).thenReturn(3L);
        when(supplierRepository.findById(id)).thenReturn(Optional.of(supplier));

        Supplier result = supplierService.updateSupplier(id, command);

        assertThat(result).isSameAs(supplier);
        verify(supplier).updateDetails(
                command.name(),
                command.type(),
                command.building(),
                command.floor(),
                command.locationDescription(),
                command.latitude(),
                command.longitude(),
                command.openingTime(),
                command.closingTime(),
                command.imageUrl());
        verify(supplierRepository).flush();
    }

    @Test
    void rejectsUnknownSupplierDuringUpdate() {
        UUID id = UUID.randomUUID();
        when(supplierRepository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> supplierService.updateSupplier(id, updateCommand(0L)))
                .isInstanceOf(SupplierNotFoundException.class)
                .extracting("supplierId")
                .isEqualTo(id);

        verify(supplierRepository, never()).flush();
    }

    @Test
    void rejectsAlreadyStaleVersionBeforeChangingSupplier() {
        UUID id = UUID.randomUUID();
        Supplier supplier = mock(Supplier.class);
        when(supplier.getVersion()).thenReturn(4L);
        when(supplierRepository.findById(id)).thenReturn(Optional.of(supplier));

        assertThatThrownBy(() -> supplierService.updateSupplier(id, updateCommand(3L)))
                .isInstanceOf(SupplierUpdateConflictException.class)
                .hasMessage("Supplier has changed since the requested version")
                .extracting("supplierId", "requestedVersion", "currentVersion")
                .containsExactly(id, 3L, 4L);

        verify(supplier, never()).updateDetails(
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyDouble(),
                org.mockito.ArgumentMatchers.anyDouble(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
        verify(supplierRepository, never()).flush();
    }

    @Test
    void translatesFlushRaceIntoVersionConflict() {
        UUID id = UUID.randomUUID();
        Supplier supplier = mock(Supplier.class);
        when(supplier.getVersion()).thenReturn(3L);
        when(supplierRepository.findById(id)).thenReturn(Optional.of(supplier));
        OptimisticLockingFailureException race =
                new OptimisticLockingFailureException("concurrent update");
        org.mockito.Mockito.doThrow(race).when(supplierRepository).flush();

        assertThatThrownBy(() -> supplierService.updateSupplier(id, updateCommand(3L)))
                .isInstanceOf(SupplierUpdateConflictException.class)
                .hasCause(race)
                .extracting("supplierId", "requestedVersion", "currentVersion")
                .containsExactly(id, 3L, null);
    }

    @Test
    void changesSupplierStatusAndFlushesManagedEntity() {
        UUID id = UUID.randomUUID();
        Supplier supplier = mock(Supplier.class);
        ChangeSupplierStatusCommand command =
                new ChangeSupplierStatusCommand(SupplierStatus.INACTIVE, 3L);
        when(supplier.getVersion()).thenReturn(3L);
        when(supplier.changeStatus(SupplierStatus.INACTIVE)).thenReturn(true);
        when(supplierRepository.findById(id)).thenReturn(Optional.of(supplier));

        Supplier result = supplierService.changeSupplierStatus(id, command);

        assertThat(result).isSameAs(supplier);
        verify(supplier).changeStatus(SupplierStatus.INACTIVE);
        verify(supplierRepository).flush();
    }

    @Test
    void skipsFlushWhenSupplierAlreadyHasRequestedStatus() {
        UUID id = UUID.randomUUID();
        Supplier supplier = mock(Supplier.class);
        ChangeSupplierStatusCommand command =
                new ChangeSupplierStatusCommand(SupplierStatus.ACTIVE, 2L);
        when(supplier.getVersion()).thenReturn(2L);
        when(supplier.changeStatus(SupplierStatus.ACTIVE)).thenReturn(false);
        when(supplierRepository.findById(id)).thenReturn(Optional.of(supplier));

        Supplier result = supplierService.changeSupplierStatus(id, command);

        assertThat(result).isSameAs(supplier);
        verify(supplier).changeStatus(SupplierStatus.ACTIVE);
        verify(supplierRepository, never()).flush();
    }

    @Test
    void rejectsUnknownSupplierDuringStatusChange() {
        UUID id = UUID.randomUUID();
        ChangeSupplierStatusCommand command =
                new ChangeSupplierStatusCommand(SupplierStatus.INACTIVE, 0L);
        when(supplierRepository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> supplierService.changeSupplierStatus(id, command))
                .isInstanceOf(SupplierNotFoundException.class)
                .extracting("supplierId")
                .isEqualTo(id);

        verify(supplierRepository, never()).flush();
    }

    @Test
    void checksVersionBeforeStatusNoOp() {
        UUID id = UUID.randomUUID();
        Supplier supplier = mock(Supplier.class);
        ChangeSupplierStatusCommand command =
                new ChangeSupplierStatusCommand(SupplierStatus.ACTIVE, 2L);
        when(supplier.getVersion()).thenReturn(3L);
        when(supplierRepository.findById(id)).thenReturn(Optional.of(supplier));

        assertThatThrownBy(() -> supplierService.changeSupplierStatus(id, command))
                .isInstanceOf(SupplierUpdateConflictException.class)
                .extracting("supplierId", "requestedVersion", "currentVersion")
                .containsExactly(id, 2L, 3L);

        verify(supplier, never()).changeStatus(SupplierStatus.ACTIVE);
        verify(supplierRepository, never()).flush();
    }

    @Test
    void translatesStatusFlushRaceIntoVersionConflict() {
        UUID id = UUID.randomUUID();
        Supplier supplier = mock(Supplier.class);
        ChangeSupplierStatusCommand command =
                new ChangeSupplierStatusCommand(SupplierStatus.INACTIVE, 3L);
        when(supplier.getVersion()).thenReturn(3L);
        when(supplier.changeStatus(SupplierStatus.INACTIVE)).thenReturn(true);
        when(supplierRepository.findById(id)).thenReturn(Optional.of(supplier));
        OptimisticLockingFailureException race =
                new OptimisticLockingFailureException("concurrent status change");
        org.mockito.Mockito.doThrow(race).when(supplierRepository).flush();

        assertThatThrownBy(() -> supplierService.changeSupplierStatus(id, command))
                .isInstanceOf(SupplierUpdateConflictException.class)
                .hasCause(race)
                .extracting("supplierId", "requestedVersion", "currentVersion")
                .containsExactly(id, 3L, null);
    }

    @ParameterizedTest
    @EnumSource(SupplierStatus.class)
    void deletesActiveOrInactiveSupplierAndFlushes(SupplierStatus status) {
        UUID id = UUID.randomUUID();
        Supplier supplier = mock(Supplier.class);
        DeleteSupplierCommand command = new DeleteSupplierCommand(2L);
        when(supplier.getStatus()).thenReturn(status);
        when(supplier.getVersion()).thenReturn(2L);
        when(supplierRepository.findById(id)).thenReturn(Optional.of(supplier));

        supplierService.deleteSupplier(id, command);

        verify(supplierRepository).delete(same(supplier));
        verify(supplierRepository).flush();
    }

    @Test
    void rejectsUnknownSupplierDuringDelete() {
        UUID id = UUID.randomUUID();
        when(supplierRepository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> supplierService.deleteSupplier(
                        id,
                        new DeleteSupplierCommand(0L)))
                .isInstanceOf(SupplierNotFoundException.class)
                .extracting("supplierId")
                .isEqualTo(id);

        verify(supplierRepository, never()).delete(
                org.mockito.ArgumentMatchers.any(Supplier.class));
        verify(supplierRepository, never()).flush();
    }

    @Test
    void rejectsStaleDeleteBeforeRemovingSupplier() {
        UUID id = UUID.randomUUID();
        Supplier supplier = mock(Supplier.class);
        when(supplier.getVersion()).thenReturn(3L);
        when(supplierRepository.findById(id)).thenReturn(Optional.of(supplier));

        assertThatThrownBy(() -> supplierService.deleteSupplier(
                        id,
                        new DeleteSupplierCommand(2L)))
                .isInstanceOf(SupplierUpdateConflictException.class)
                .extracting("supplierId", "requestedVersion", "currentVersion")
                .containsExactly(id, 2L, 3L);

        verify(supplierRepository, never()).delete(
                org.mockito.ArgumentMatchers.any(Supplier.class));
        verify(supplierRepository, never()).flush();
    }

    @Test
    void translatesDeleteFlushRaceIntoVersionConflict() {
        UUID id = UUID.randomUUID();
        Supplier supplier = mock(Supplier.class);
        DeleteSupplierCommand command = new DeleteSupplierCommand(3L);
        when(supplier.getVersion()).thenReturn(3L);
        when(supplierRepository.findById(id)).thenReturn(Optional.of(supplier));
        OptimisticLockingFailureException race =
                new OptimisticLockingFailureException("concurrent delete");
        org.mockito.Mockito.doThrow(race).when(supplierRepository).flush();

        assertThatThrownBy(() -> supplierService.deleteSupplier(id, command))
                .isInstanceOf(SupplierUpdateConflictException.class)
                .hasCause(race)
                .extracting("supplierId", "requestedVersion", "currentVersion")
                .containsExactly(id, 3L, null);

        verify(supplierRepository).delete(same(supplier));
    }

    private UpdateSupplierCommand updateCommand(long version) {
        return new UpdateSupplierCommand(
                "Updated Campus Cafe",
                "Food/Coffee",
                "COM3",
                "2",
                "Now beside the lift",
                1.2948,
                103.7716,
                LocalTime.of(9, 0),
                LocalTime.of(20, 0),
                "https://example.com/updated-cafe.jpg",
                version);
    }

    private Supplier supplierNamed(String name) {
        Supplier supplier = mock(Supplier.class);
        when(supplier.getName()).thenReturn(name);
        return supplier;
    }
}
