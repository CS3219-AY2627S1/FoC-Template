package com.friendoncampus.user.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.friendoncampus.user.domain.AdminBootstrapState;

import jakarta.persistence.LockModeType;

public interface AdminBootstrapStateRepository extends JpaRepository<AdminBootstrapState, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select state from AdminBootstrapState state where state.id = :id")
    Optional<AdminBootstrapState> findByIdForUpdate(@Param("id") String id);
}
