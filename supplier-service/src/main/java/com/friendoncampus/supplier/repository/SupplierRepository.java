package com.friendoncampus.supplier.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.friendoncampus.supplier.domain.Supplier;
import com.friendoncampus.supplier.domain.SupplierStatus;

public interface SupplierRepository
        extends JpaRepository<Supplier, UUID>, JpaSpecificationExecutor<Supplier> {

    @Query("select distinct supplier.type from Supplier supplier where supplier.status = :status")
    List<String> findDistinctTypesByStatus(@Param("status") SupplierStatus status);

    @Query("select distinct supplier.building from Supplier supplier where supplier.status = :status")
    List<String> findDistinctBuildingsByStatus(@Param("status") SupplierStatus status);

    @Query("select distinct supplier.type from Supplier supplier")
    List<String> findDistinctTypes();

    @Query("select distinct supplier.building from Supplier supplier")
    List<String> findDistinctBuildings();
}
