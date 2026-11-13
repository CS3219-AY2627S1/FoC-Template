package com.friendoncampus.order.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;

import com.friendoncampus.order.domain.Order;

/**
 * SHA-256 of a create request's validated fields, used to tell a retried request (same
 * fingerprint) from a different request reusing the key. Fields are length-prefixed so no two
 * different requests can join into the same text, and the deadline is compared as a UTC instant at
 * stored precision, so the same moment sent with another offset still matches.
 */
final class CreateOrderFingerprint {

    private CreateOrderFingerprint() {
    }

    static String of(CreateOrderCommand command) {
        List<Object> fields = List.of(
                command.title(),
                command.description(),
                command.pickupLocationId(),
                Objects.toString(command.pickupLocationName(), ""),
                command.dropoffLocationId(),
                Objects.toString(command.dropoffLocationName(), ""),
                command.creditReward(),
                Order.toStoredPrecision(command.pickupDeadline()).withOffsetSameInstant(ZoneOffset.UTC).toInstant());
        StringBuilder text = new StringBuilder();
        for (Object field : fields) {
            String value = field.toString();
            text.append(value.length()).append(':').append(value).append(';');
        }
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(text.toString().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
