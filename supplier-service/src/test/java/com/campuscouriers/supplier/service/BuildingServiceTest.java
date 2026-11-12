/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-11-10
 * Scope: Generated service tests for building creation, listing, and administration.
 */
package com.campuscouriers.supplier.service;

import com.campuscouriers.supplier.dto.CreateBuildingRequest;
import com.campuscouriers.supplier.entity.Building;
import com.campuscouriers.supplier.entity.BuildingStatus;
import com.campuscouriers.supplier.exception.DuplicateBuildingException;
import com.campuscouriers.supplier.exception.ActiveSuppliersAssignedException;
import com.campuscouriers.supplier.repository.BuildingRepository;
import com.campuscouriers.supplier.repository.SupplierRepository;
import com.campuscouriers.supplier.dto.UpdateBuildingRequest;
import com.campuscouriers.supplier.entity.SupplierStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@ExtendWith(MockitoExtension.class)
class BuildingServiceTest {

    @Mock
    private BuildingRepository buildingRepository;

    @Mock
    private SupplierRepository supplierRepository;

    @InjectMocks
    private BuildingService buildingService;

    @Test
    void findActive_returnsRepositoryResultsInResponse() {
        when(buildingRepository.findAllByStatusOrderByNormalizedNameAsc(BuildingStatus.ACTIVE))
                .thenReturn(List.of(new Building("COM3", "com3")));

        var response = buildingService.findActive();

        assertThat(response.items()).extracting(item -> item.name()).containsExactly("COM3");
    }

    @Test
    void findDeactivated_returnsOnlyRetiredRepositoryResults() {
        Building building = new Building("Old Block", "old block");
        building.deactivate();
        when(buildingRepository.findAllByStatusOrderByNormalizedNameAsc(BuildingStatus.RETIRED))
                .thenReturn(List.of(building));

        var response = buildingService.findDeactivated();

        assertThat(response.items()).extracting(item -> item.status())
                .containsExactly(BuildingStatus.RETIRED);
    }

    @Test
    void create_trimsAndNormalizesNameAndDefaultsToActive() {
        when(buildingRepository.saveAndFlush(any(Building.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = buildingService.create(new CreateBuildingRequest("  Central   Library  "));

        ArgumentCaptor<Building> captor = ArgumentCaptor.forClass(Building.class);
        verify(buildingRepository).existsByNormalizedName("central library");
        verify(buildingRepository).saveAndFlush(captor.capture());
        assertThat(captor.getValue().getName()).isEqualTo("Central Library");
        assertThat(captor.getValue().getNormalizedName()).isEqualTo("central library");
        assertThat(response.name()).isEqualTo("Central Library");
        assertThat(response.status()).isEqualTo(BuildingStatus.ACTIVE);
    }

    @Test
    void create_whenNormalizedNameExists_throwsAndDoesNotSave() {
        when(buildingRepository.existsByNormalizedName("com3")).thenReturn(true);

        assertThatThrownBy(() -> buildingService.create(new CreateBuildingRequest(" COM3 ")))
                .isInstanceOf(DuplicateBuildingException.class);

        verify(buildingRepository, never()).saveAndFlush(any());
    }

    @Test
    void update_renamesReferencedBuildingUsingCreationRules() {
        UUID id = UUID.randomUUID();
        Building building = new Building("COM3", "com3");
        when(buildingRepository.findById(id)).thenReturn(Optional.of(building));
        when(buildingRepository.saveAndFlush(building)).thenReturn(building);

        var response = buildingService.update(id, new UpdateBuildingRequest(" Central   Library "));

        verify(buildingRepository).existsByNormalizedNameAndIdNot("central library", id);
        assertThat(response.name()).isEqualTo("Central Library");
    }

    @Test
    void deactivate_whenActiveSupplierIsAssigned_returnsConflictAndDoesNotSave() {
        UUID id = UUID.randomUUID();
        Building building = new Building("COM3", "com3");
        when(buildingRepository.findById(id)).thenReturn(Optional.of(building));
        when(supplierRepository.existsByBuildingIdAndStatus(id, SupplierStatus.ACTIVE)).thenReturn(true);

        assertThatThrownBy(() -> buildingService.deactivate(id))
                .isInstanceOf(ActiveSuppliersAssignedException.class);

        assertThat(building.getStatus()).isEqualTo(BuildingStatus.ACTIVE);
        verify(buildingRepository, never()).saveAndFlush(any());
    }

    @Test
    void deactivateAndReactivate_whenNoActiveSupplier_changesStatus() {
        UUID id = UUID.randomUUID();
        Building building = new Building("COM3", "com3");
        when(buildingRepository.findById(id)).thenReturn(Optional.of(building));
        when(buildingRepository.saveAndFlush(building)).thenReturn(building);

        assertThat(buildingService.deactivate(id).status()).isEqualTo(BuildingStatus.RETIRED);
        assertThat(buildingService.reactivate(id).status()).isEqualTo(BuildingStatus.ACTIVE);
    }
}
