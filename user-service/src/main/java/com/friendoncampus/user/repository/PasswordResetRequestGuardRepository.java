package com.friendoncampus.user.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.friendoncampus.user.domain.PasswordResetRequestGuard;

import jakarta.persistence.LockModeType;

public interface PasswordResetRequestGuardRepository extends JpaRepository<PasswordResetRequestGuard, Integer> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select guard from PasswordResetRequestGuard guard where guard.id = :id")
    Optional<PasswordResetRequestGuard> lockForRequest(@Param("id") Integer id);
}
