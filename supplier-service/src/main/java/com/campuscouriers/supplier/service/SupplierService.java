/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
 * Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-10-02
 * Scope: Generated supplier creation, search, retrieval, update, and lifecycle operations.
 */
package com.campuscouriers.supplier.service;

import com.campuscouriers.supplier.dto.CreateSupplierRequest;
import com.campuscouriers.supplier.dto.SupplierResponse;
import com.campuscouriers.supplier.dto.PageMetadata;
import com.campuscouriers.supplier.dto.SupplierPageResponse;
import com.campuscouriers.supplier.dto.UpdateSupplierRequest;
import com.campuscouriers.supplier.entity.Building;
import com.campuscouriers.supplier.entity.BuildingStatus;
import com.campuscouriers.supplier.entity.Category;
import com.campuscouriers.supplier.entity.CategoryStatus;
import com.campuscouriers.supplier.entity.Supplier;
import com.campuscouriers.supplier.entity.SupplierStatus;
import com.campuscouriers.supplier.event.SupplierEventPublisher;
import com.campuscouriers.supplier.exception.DuplicateSupplierException;
import com.campuscouriers.supplier.exception.InactiveReferencesException;
import com.campuscouriers.supplier.exception.ReferenceNotFoundException;
import com.campuscouriers.supplier.exception.InvalidQueryParameterException;
import com.campuscouriers.supplier.repository.BuildingRepository;
import com.campuscouriers.supplier.repository.CategoryRepository;
import com.campuscouriers.supplier.repository.SupplierRepository;
import com.campuscouriers.supplier.repository.SupplierSpecifications;
import com.campuscouriers.supplier.util.NameNormalizer;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

import java.util.Locale;
import java.util.ArrayList;
import java.util.UUID;

@Service
public class SupplierService {

    private final SupplierRepository supplierRepository;
    private final CategoryRepository categoryRepository;
    private final BuildingRepository buildingRepository;
    private final SupplierEventPublisher supplierEventPublisher;

    public SupplierService(
            SupplierRepository supplierRepository,
            CategoryRepository categoryRepository,
            BuildingRepository buildingRepository,
            SupplierEventPublisher supplierEventPublisher
    ) {
        this.supplierRepository = supplierRepository;
        this.categoryRepository = categoryRepository;
        this.buildingRepository = buildingRepository;
        this.supplierEventPublisher = supplierEventPublisher;
    }

    @Transactional
    public SupplierResponse create(CreateSupplierRequest request) {
        Category category = categoryRepository.findById(request.categoryId())
                .orElseThrow(() -> new ReferenceNotFoundException("Category", request.categoryId()));
        Building building = buildingRepository.findById(request.buildingId())
                .orElseThrow(() -> new ReferenceNotFoundException("Building", request.buildingId()));
        validateActiveReferences(category, building);

        String displayName = NameNormalizer.displayName(request.name());
        String normalizedName = NameNormalizer.normalizedName(displayName);
        String floor = optionalDisplayValue(request.floor());
        String normalizedFloor = floor == null ? "" : floor.toLowerCase(Locale.ROOT);

        if (supplierRepository.existsByNormalizedNameAndBuildingId(
                normalizedName, building.getId())) {
            throw new DuplicateSupplierException(displayName);
        }

        Supplier supplier = new Supplier(
                displayName,
                normalizedName,
                category,
                building,
                floor,
                normalizedFloor,
                optionalDisplayValue(request.description()),
                request.openingTime(),
                request.closingTime(),
                optionalDisplayValue(request.imageUrl())
        );

        Supplier saved;
        try {
            saved = supplierRepository.saveAndFlush(supplier);
        } catch (DataIntegrityViolationException exception) {
            throw new DuplicateSupplierException(displayName);
        }
        supplierEventPublisher.publishSupplierCreated(saved);
        return SupplierResponse.from(saved);
    }

    @Transactional(readOnly = true)
    public SupplierPageResponse findActive(
            String query,
            UUID categoryId,
            UUID buildingId,
            int page,
            int size,
            String sort
    ) {
        return findByStatus(SupplierStatus.ACTIVE, query, categoryId, buildingId, page, size, sort);
    }

    @Transactional(readOnly = true)
    public SupplierPageResponse findDeactivated(
            String query,
            UUID categoryId,
            UUID buildingId,
            int page,
            int size,
            String sort
    ) {
        return findByStatus(SupplierStatus.INACTIVE, query, categoryId, buildingId, page, size, sort);
    }

    @Transactional(readOnly = true)
    public SupplierResponse findActiveById(UUID id) {
        Supplier supplier = supplierRepository.findByIdAndStatus(id, SupplierStatus.ACTIVE)
                .orElseThrow(() -> new ReferenceNotFoundException("Supplier", id));
        return SupplierResponse.from(supplier);
    }

    @Transactional
    public SupplierResponse update(UUID id, UpdateSupplierRequest request) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new ReferenceNotFoundException("Supplier", id));
        Category category = categoryRepository.findById(request.categoryId())
                .orElseThrow(() -> new ReferenceNotFoundException("Category", request.categoryId()));
        Building building = buildingRepository.findById(request.buildingId())
                .orElseThrow(() -> new ReferenceNotFoundException("Building", request.buildingId()));
        validateActiveReferences(category, building);

        String displayName = NameNormalizer.displayName(request.name());
        String normalizedName = NameNormalizer.normalizedName(displayName);
        String floor = optionalDisplayValue(request.floor());
        String normalizedFloor = floor == null ? "" : floor.toLowerCase(Locale.ROOT);

        if (supplierRepository.existsByNormalizedNameAndBuildingIdAndIdNot(
                normalizedName, building.getId(), id)) {
            throw new DuplicateSupplierException(displayName);
        }

        supplier.updateDetails(
                displayName,
                normalizedName,
                category,
                building,
                floor,
                normalizedFloor,
                optionalDisplayValue(request.description()),
                request.openingTime(),
                request.closingTime(),
                optionalDisplayValue(request.imageUrl())
        );

        Supplier saved;
        try {
            saved = supplierRepository.saveAndFlush(supplier);
        } catch (DataIntegrityViolationException exception) {
            throw new DuplicateSupplierException(displayName);
        }
        supplierEventPublisher.publishSupplierUpdated(saved);
        return SupplierResponse.from(saved);
    }

    @Transactional
    public SupplierResponse deactivate(UUID id) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new ReferenceNotFoundException("Supplier", id));

        supplier.deactivate();
        return SupplierResponse.from(supplierRepository.saveAndFlush(supplier));
    }

    @Transactional
    public SupplierResponse reactivate(UUID id) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new ReferenceNotFoundException("Supplier", id));

        validateActiveReferences(supplier.getCategory(), supplier.getBuilding());

        supplier.reactivate();
        return SupplierResponse.from(supplierRepository.saveAndFlush(supplier));
    }

    private void validateActiveReferences(Category category, Building building) {
        ArrayList<String> inactiveReferences = new ArrayList<>(2);
        if (category.getStatus() != CategoryStatus.ACTIVE) {
            inactiveReferences.add("category");
        }
        if (building.getStatus() != BuildingStatus.ACTIVE) {
            inactiveReferences.add("building");
        }
        if (!inactiveReferences.isEmpty()) {
            throw new InactiveReferencesException(inactiveReferences);
        }
    }

    private void validatePagination(int page, int size) {
        if (page < 0) {
            throw new InvalidQueryParameterException("Page must be zero or greater");
        }
        if (size < 1 || size > 100) {
            throw new InvalidQueryParameterException("Size must be between 1 and 100");
        }
    }

    private SupplierPageResponse findByStatus(
            SupplierStatus status,
            String query,
            UUID categoryId,
            UUID buildingId,
            int page,
            int size,
            String sort
    ) {
        validatePagination(page, size);
        Sort.Direction direction = parseSortDirection(sort);

        Specification<Supplier> specification = Specification
                .where(SupplierSpecifications.hasStatus(status))
                .and(SupplierSpecifications.nameContains(query))
                .and(SupplierSpecifications.hasCategory(categoryId))
                .and(SupplierSpecifications.hasBuilding(buildingId));

        Page<Supplier> suppliers = supplierRepository.findAll(
                specification,
                PageRequest.of(page, size, Sort.by(direction, "normalizedName"))
        );

        return new SupplierPageResponse(
                suppliers.getContent().stream().map(SupplierResponse::from).toList(),
                PageMetadata.from(suppliers)
        );
    }

    private Sort.Direction parseSortDirection(String sort) {
        return switch (sort) {
            case "name,asc" -> Sort.Direction.ASC;
            case "name,desc" -> Sort.Direction.DESC;
            default -> throw new InvalidQueryParameterException(
                    "Sort must be either name,asc or name,desc");
        };
    }

    private String optionalDisplayValue(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return NameNormalizer.displayName(value);
    }
}
