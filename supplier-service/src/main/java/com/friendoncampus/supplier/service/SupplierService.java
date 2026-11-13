package com.friendoncampus.supplier.service;

import java.util.List;
import java.util.UUID;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.supplier.domain.Supplier;
import com.friendoncampus.supplier.domain.SupplierStatus;
import com.friendoncampus.supplier.repository.SupplierRepository;
import com.friendoncampus.supplier.repository.SupplierSpecifications;

@Service
@Transactional(readOnly = true)
public class SupplierService {

    private final SupplierRepository supplierRepository;
    private final SupplierImageCleanup imageCleanup;

    public SupplierService(
            SupplierRepository supplierRepository,
            SupplierImageCleanup imageCleanup) {
        this.supplierRepository = supplierRepository;
        this.imageCleanup = imageCleanup;
    }

    public Page<Supplier> listActiveSuppliers(SupplierQuery supplierQuery) {
        return listSuppliers(supplierQuery, SupplierStatus.ACTIVE);
    }

    public Page<Supplier> listSuppliersForAdmin(AdminSupplierQuery adminQuery) {
        return listSuppliers(adminQuery.supplierQuery(), adminQuery.status());
    }

    private Page<Supplier> listSuppliers(
            SupplierQuery supplierQuery,
            SupplierStatus requiredStatus) {
        Specification<Supplier> specification = (root, query, criteriaBuilder) ->
                criteriaBuilder.conjunction();

        if (requiredStatus != null) {
            specification = specification.and(
                    SupplierSpecifications.hasStatus(requiredStatus));
        }
        if (supplierQuery.search() != null) {
            specification = specification.and(
                    SupplierSpecifications.matchesSearch(supplierQuery.search()));
        }
        if (supplierQuery.type() != null) {
            specification = specification.and(
                    SupplierSpecifications.hasType(supplierQuery.type()));
        }
        if (supplierQuery.building() != null) {
            specification = specification.and(
                    SupplierSpecifications.isInBuilding(supplierQuery.building()));
        }

        return supplierRepository.findAll(specification, supplierQuery.toPageRequest());
    }

    public Supplier getSupplier(UUID id) {
        return supplierRepository.findById(id)
                .orElseThrow(() -> new SupplierNotFoundException(id));
    }

    public SupplierMetadata getActiveSupplierMetadata() {
        return new SupplierMetadata(
                sortedCaseInsensitively(
                        supplierRepository.findDistinctTypesByStatus(SupplierStatus.ACTIVE)),
                sortedCaseInsensitively(
                        supplierRepository.findDistinctBuildingsByStatus(SupplierStatus.ACTIVE)));
    }

    public SupplierMetadata getAllSupplierMetadata() {
        return new SupplierMetadata(
                sortedCaseInsensitively(supplierRepository.findDistinctTypes()),
                sortedCaseInsensitively(supplierRepository.findDistinctBuildings()));
    }

    private static List<String> sortedCaseInsensitively(List<String> values) {
        return values.stream()
                .distinct()
                .sorted(String.CASE_INSENSITIVE_ORDER.thenComparing(String::compareTo))
                .toList();
    }

    @Transactional
    public Supplier createSupplier(CreateSupplierCommand command) {
        Supplier supplier = Supplier.create(
                command.name(),
                command.type(),
                command.building(),
                command.floor(),
                command.locationDescription(),
                command.latitude(),
                command.longitude(),
                command.openingTime(),
                command.closingTime(),
                command.imageUrl(),
                command.status());
        return supplierRepository.save(supplier);
    }

    @Transactional
    public Supplier updateSupplier(UUID id, UpdateSupplierCommand command) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new SupplierNotFoundException(id));

        if (supplier.getVersion() != command.version()) {
            throw new SupplierUpdateConflictException(
                    id,
                    command.version(),
                    supplier.getVersion());
        }

        String previousObjectKey = supplier.getImageObjectKey();
        supplier.updateDetails(
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

        try {
            supplierRepository.flush();
        } catch (OptimisticLockingFailureException exception) {
            throw new SupplierUpdateConflictException(
                    id,
                    command.version(),
                    null,
                    exception);
        }
        if (previousObjectKey != null && !previousObjectKey.equals(supplier.getImageObjectKey())) {
            imageCleanup.deleteAfterCommit(previousObjectKey);
        }
        return supplier;
    }

    @Transactional
    public Supplier changeSupplierStatus(UUID id, ChangeSupplierStatusCommand command) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new SupplierNotFoundException(id));

        if (supplier.getVersion() != command.version()) {
            throw new SupplierUpdateConflictException(
                    id,
                    command.version(),
                    supplier.getVersion());
        }

        if (!supplier.changeStatus(command.status())) {
            return supplier;
        }

        try {
            supplierRepository.flush();
        } catch (OptimisticLockingFailureException exception) {
            throw new SupplierUpdateConflictException(
                    id,
                    command.version(),
                    null,
                    exception);
        }
        return supplier;
    }

    @Transactional
    public void deleteSupplier(UUID id, DeleteSupplierCommand command) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new SupplierNotFoundException(id));

        if (supplier.getVersion() != command.version()) {
            throw new SupplierUpdateConflictException(
                    id,
                    command.version(),
                    supplier.getVersion());
        }

        String imageObjectKey = supplier.getImageObjectKey();
        try {
            supplierRepository.delete(supplier);
            supplierRepository.flush();
        } catch (OptimisticLockingFailureException exception) {
            throw new SupplierUpdateConflictException(
                    id,
                    command.version(),
                    null,
                    exception);
        }
        imageCleanup.deleteAfterCommit(imageObjectKey);
    }
}
