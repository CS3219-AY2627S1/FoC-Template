package com.friendoncampus.admin;

import java.util.UUID;

/** Returns only after Kafka commit. Verify the original DB lease after epoch initialization,
 * before any send; a thrown result remains unconfirmed. */
public interface CaseEventSender {
    void send(UUID caseId, String originalPayload, Runnable verifyDatabaseLease);
}
