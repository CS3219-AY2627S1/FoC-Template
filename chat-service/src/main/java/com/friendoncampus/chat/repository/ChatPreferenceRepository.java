package com.friendoncampus.chat.repository;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.friendoncampus.chat.domain.ChatPreference;

import jakarta.persistence.LockModeType;

public interface ChatPreferenceRepository extends JpaRepository<ChatPreference, UUID> {

    @Modifying
    @Query(value = """
            INSERT INTO chat_preferences (user_id, preferred_language, created_at, updated_at)
            VALUES (:userId, 'EN', :now, :now)
            ON CONFLICT (user_id) DO NOTHING
            """, nativeQuery = true)
    int insertDefaultIfAbsent(@Param("userId") UUID userId, @Param("now") OffsetDateTime now);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select preference from ChatPreference preference where preference.userId = :userId")
    Optional<ChatPreference> findByUserIdForUpdate(@Param("userId") UUID userId);
}
