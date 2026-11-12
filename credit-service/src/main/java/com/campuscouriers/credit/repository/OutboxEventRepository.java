/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-06
 * Scope (AI-61): Generated the OutboxEventRepository interface for the credit service to store and retrieve outbox events from the database
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.repository;

import com.campuscouriers.credit.entity.OutboxEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, UUID> {
}