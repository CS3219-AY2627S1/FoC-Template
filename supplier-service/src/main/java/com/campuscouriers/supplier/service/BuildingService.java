/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-11-10
 * Scope: Generated building creation, listing, update, and lifecycle operations.
 */
package com.campuscouriers.supplier.service;

import com.campuscouriers.supplier.dto.BuildingResponse;
import com.campuscouriers.supplier.dto.CreateBuildingRequest;
import com.campuscouriers.supplier.dto.ItemListResponse;
import com.campuscouriers.supplier.dto.UpdateBuildingRequest;
import com.campuscouriers.supplier.entity.Building;
import com.campuscouriers.supplier.entity.BuildingStatus;
import com.campuscouriers.supplier.exception.DuplicateBuildingException;
import com.campuscouriers.supplier.exception.ActiveSuppliersAssignedException;
import com.campuscouriers.supplier.exception.ReferenceNotFoundException;
import com.campuscouriers.supplier.repository.BuildingRepository;
import com.campuscouriers.supplier.repository.SupplierRepository;
import com.campuscouriers.supplier.entity.SupplierStatus;
import com.campuscouriers.supplier.util.NameNormalizer;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BuildingService {

    private final BuildingRepository buildingRepository;
    private final SupplierRepository supplierRepository;

    public BuildingService(BuildingRepository buildingRepository, SupplierRepository supplierRepository) {
        this.buildingRepository = buildingRepository;
        this.supplierRepository = supplierRepository;
    }

    @Transactional
    public BuildingResponse create(CreateBuildingRequest request) {
        String displayName = NameNormalizer.displayName(request.name());
        String normalizedName = NameNormalizer.normalizedName(displayName);

        if (buildingRepository.existsByNormalizedName(normalizedName)) {
            throw new DuplicateBuildingException(displayName);
        }

        try {
            Building building = buildingRepository.saveAndFlush(new Building(displayName, normalizedName));
            return BuildingResponse.from(building);
        } catch (DataIntegrityViolationException exception) {
            throw new DuplicateBuildingException(displayName);
        }
    }

    @Transactional(readOnly = true)
    public ItemListResponse<BuildingResponse> findActive() {
        return new ItemListResponse<>(buildingRepository
                .findAllByStatusOrderByNormalizedNameAsc(BuildingStatus.ACTIVE)
                .stream()
                .map(BuildingResponse::from)
                .toList());
    }

    @Transactional(readOnly = true)
    public ItemListResponse<BuildingResponse> findDeactivated() {
        return new ItemListResponse<>(buildingRepository
                .findAllByStatusOrderByNormalizedNameAsc(BuildingStatus.RETIRED)
                .stream()
                .map(BuildingResponse::from)
                .toList());
    }

    @Transactional(readOnly = true)
    public BuildingResponse findById(java.util.UUID id) {
        return BuildingResponse.from(findBuilding(id));
    }

    @Transactional
    public BuildingResponse update(java.util.UUID id, UpdateBuildingRequest request) {
        Building building = findBuilding(id);
        String displayName = NameNormalizer.displayName(request.name());
        String normalizedName = NameNormalizer.normalizedName(displayName);
        if (buildingRepository.existsByNormalizedNameAndIdNot(normalizedName, id)) {
            throw new DuplicateBuildingException(displayName);
        }
        building.rename(displayName, normalizedName);
        try {
            return BuildingResponse.from(buildingRepository.saveAndFlush(building));
        } catch (DataIntegrityViolationException exception) {
            throw new DuplicateBuildingException(displayName);
        }
    }

    @Transactional
    public BuildingResponse deactivate(java.util.UUID id) {
        Building building = findBuilding(id);
        if (supplierRepository.existsByBuildingIdAndStatus(id, SupplierStatus.ACTIVE)) {
            throw new ActiveSuppliersAssignedException("Building");
        }
        building.deactivate();
        return BuildingResponse.from(buildingRepository.saveAndFlush(building));
    }

    @Transactional
    public BuildingResponse reactivate(java.util.UUID id) {
        Building building = findBuilding(id);
        building.reactivate();
        return BuildingResponse.from(buildingRepository.saveAndFlush(building));
    }

    private Building findBuilding(java.util.UUID id) {
        return buildingRepository.findById(id)
                .orElseThrow(() -> new ReferenceNotFoundException("Building", id));
    }
}
