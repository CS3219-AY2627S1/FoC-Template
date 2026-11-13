package com.friendoncampus.credit.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.friendoncampus.credit.domain.CreditOperation;

public interface CreditOperationRepository extends JpaRepository<CreditOperation, UUID> {
}
