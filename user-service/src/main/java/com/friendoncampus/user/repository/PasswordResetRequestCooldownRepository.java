package com.friendoncampus.user.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.friendoncampus.user.domain.PasswordResetRequestCooldown;

import jakarta.persistence.LockModeType;

public interface PasswordResetRequestCooldownRepository extends JpaRepository<PasswordResetRequestCooldown, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select cooldown from PasswordResetRequestCooldown cooldown where cooldown.emailDigest = :emailDigest")
    Optional<PasswordResetRequestCooldown> findByEmailDigestForUpdate(@Param("emailDigest") String emailDigest);
}
