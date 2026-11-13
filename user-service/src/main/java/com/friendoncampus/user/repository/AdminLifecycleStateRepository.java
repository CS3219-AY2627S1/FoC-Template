package com.friendoncampus.user.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.friendoncampus.user.domain.AdminLifecycleState;

import jakarta.persistence.LockModeType;

public interface AdminLifecycleStateRepository extends JpaRepository<AdminLifecycleState, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select state from AdminLifecycleState state where state.id = :id")
    Optional<AdminLifecycleState> lockForLifecycleChange(@Param("id") String id);
}
