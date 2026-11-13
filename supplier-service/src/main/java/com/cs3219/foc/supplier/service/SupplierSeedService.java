package com.cs3219.foc.supplier.service;

import com.cs3219.foc.supplier.infrastructure.SupplierSeedCatalog;
import com.cs3219.foc.supplier.repository.SupplierRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SupplierSeedService {
    private final SupplierRepository supplierRepository;

    /**
     * Inserts catalog suppliers whose ids are not already stored. An existing supplier and its opening hours are left
     * unchanged.
     *
     * @return how many suppliers were inserted
     */
    @Transactional
    public int seedMissingSuppliers() {
        var inserted = 0;
        for (var row : SupplierSeedCatalog.load()) {
            var created = supplierRepository.insertIfAbsent(
                    row.id(),
                    row.name(),
                    row.category().name(),
                    row.building(),
                    row.floor(),
                    row.locationDescription(),
                    row.latitude(),
                    row.longitude(),
                    row.active());
            if (created == 0) {
                continue;
            }
            for (var hours : row.openingHours()) {
                supplierRepository.insertOpeningHours(
                        row.id(), (short) hours.dayOfWeek().getValue(), hours.opensAt(), hours.closesAt());
            }
            inserted++;
        }
        return inserted;
    }
}
