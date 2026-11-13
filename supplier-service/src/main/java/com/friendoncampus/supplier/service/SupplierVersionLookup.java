package com.friendoncampus.supplier.service;

import java.util.OptionalLong;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.supplier.repository.SupplierRepository;

@Service
public class SupplierVersionLookup {

    private final SupplierRepository supplierRepository;

    public SupplierVersionLookup(SupplierRepository supplierRepository) {
        this.supplierRepository = supplierRepository;
    }

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public OptionalLong findCurrentVersion(UUID supplierId) {
        return supplierRepository.findById(supplierId)
                .map(supplier -> OptionalLong.of(supplier.getVersion()))
                .orElseGet(OptionalLong::empty);
    }
}
