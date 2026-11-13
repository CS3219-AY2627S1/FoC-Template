package com.friendoncampus.user.repository;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.friendoncampus.user.domain.PasswordResetToken;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, UUID> {
    Optional<PasswordResetToken> findFirstByUser_IdAndUsedAtIsNullAndInvalidatedAtIsNullOrderByCreatedAtDesc(UUID userId);

    @Modifying
    @Query("update PasswordResetToken token set token.invalidatedAt = :now "
            + "where token.user.id = :userId and token.usedAt is null and token.invalidatedAt is null")
    void invalidateActiveForUser(@Param("userId") UUID userId, @Param("now") OffsetDateTime now);
}
