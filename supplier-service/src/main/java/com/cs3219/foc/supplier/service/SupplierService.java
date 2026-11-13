package com.cs3219.foc.supplier.service;

import com.cs3219.foc.supplier.exception.SupplierNotFoundException;
import com.cs3219.foc.supplier.mapper.SupplierMapper;
import com.cs3219.foc.supplier.model.dto.SupplierDto;
import com.cs3219.foc.supplier.model.dto.SupplierRequest;
import com.cs3219.foc.supplier.model.dto.SupplierSearchCriteria;
import com.cs3219.foc.supplier.model.dto.event.SupplierChange;
import com.cs3219.foc.supplier.model.dto.event.SupplierChangedEvent;
import com.cs3219.foc.supplier.model.entity.Supplier;
import com.cs3219.foc.supplier.repository.SupplierRepository;
import com.cs3219.foc.supplier.repository.SupplierSpecifications;
import com.cs3219.foc.supplier.security.CurrentUserService;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SupplierService {
    private final SupplierRepository supplierRepository;
    private final SupplierMapper supplierMapper;
    private final Clock clock;
    private final SupplierImageStorageService supplierImageStorageService;
    private final CurrentUserService currentUserService;
    private final ApplicationEventPublisher eventPublisher;

    /** list suppliers that match filters in {@code criteria}, sorted by name. */
    @Transactional(readOnly = true)
    public List<SupplierDto> listSuppliers(SupplierSearchCriteria criteria) {
        var filters = new ArrayList<Specification<Supplier>>();
        var includeInactive = criteria.includeInactive() && currentUserService.hasRole("ADMIN");
        if (!includeInactive) {
            filters.add(SupplierSpecifications.isActive());
        }
        if (criteria.query() != null && !criteria.query().isBlank()) {
            filters.add(SupplierSpecifications.matchesText(criteria.query().strip()));
        }
        if (criteria.categories() != null && !criteria.categories().isEmpty()) {
            filters.add(SupplierSpecifications.inCategories(criteria.categories()));
        }
        if (criteria.openNow()) {
            var now = ZonedDateTime.now(clock);
            filters.add(SupplierSpecifications.openAt(
                    now.getDayOfWeek(), now.toLocalTime().truncatedTo(ChronoUnit.MINUTES)));
        }

        return supplierRepository.findAll(Specification.allOf(filters), Sort.by("name")).stream()
                .map(this::buildSupplierDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public SupplierDto getSupplier(UUID id) {
        var includeInactive = currentUserService.hasRole("ADMIN");
        var supplier = includeInactive ? supplierRepository.findById(id) : supplierRepository.findByIdAndActiveTrue(id);
        return supplier.map(this::buildSupplierDto).orElseThrow(() -> new SupplierNotFoundException(id));
    }

    @Transactional
    public SupplierDto createSupplier(SupplierRequest request) {
        var normalized = request.normalized();
        var supplier = supplierMapper.toSupplier(normalized);
        supplier.replaceOpeningHours(supplierMapper.toOpeningHours(normalized.openingHours()));
        var saved = supplierRepository.saveAndFlush(supplier);

        publishSupplierChangedEvent(saved.getId(), SupplierChange.CREATED);
        return buildSupplierDto(saved);
    }

    @Transactional
    public SupplierDto updateSupplier(UUID id, SupplierRequest request) {
        var normalized = request.normalized();
        var supplier = findSupplier(id);
        supplierMapper.updateSupplier(normalized, supplier);
        supplier.replaceOpeningHours(supplierMapper.toOpeningHours(normalized.openingHours()));
        var saved = supplierRepository.saveAndFlush(supplier);

        publishSupplierChangedEvent(saved.getId(), SupplierChange.UPDATED);
        return buildSupplierDto(saved);
    }

    /** Since there might have other data may refer to supplier, so no deletion, but set if active */
    @Transactional
    public SupplierDto setSupplierActive(UUID id, boolean active) {
        var supplier = findSupplier(id);
        supplier.setActive(active);
        var saved = supplierRepository.saveAndFlush(supplier);

        var supplierChange = active ? SupplierChange.ACTIVATED : SupplierChange.DEACTIVATED;
        publishSupplierChangedEvent(saved.getId(), supplierChange);
        return buildSupplierDto(saved);
    }

    private void publishSupplierChangedEvent(UUID supplierId, SupplierChange change) {
        eventPublisher.publishEvent(SupplierChangedEvent.of(supplierId, change, OffsetDateTime.now(clock)));
    }

    private SupplierDto buildSupplierDto(Supplier supplier) {
        var imageKey = supplier.getImageKey();
        var imageUrl = supplierImageStorageService.createPresignedUrl(imageKey);
        return supplierMapper.toSupplierDto(supplier, imageUrl);
    }

    private Supplier findSupplier(UUID id) {
        return supplierRepository.findForUpdateById(id).orElseThrow(() -> new SupplierNotFoundException(id));
    }
}
