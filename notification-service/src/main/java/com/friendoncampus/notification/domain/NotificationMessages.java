package com.friendoncampus.notification.domain;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Builds the text a recipient reads from a notification's type and stored template values. Text is
 * built when read, not stored, so wording can change without rewriting past notifications.
 */
public final class NotificationMessages {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    /** Deadlines are shown in campus time; the API stores and returns UTC. */
    private static final ZoneId CAMPUS_TIME = ZoneId.of("Asia/Singapore");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH);

    private NotificationMessages() {
    }

    public static String messageFor(Notification notification) {
        JsonNode params = JSON.readTree(notification.getParams());
        return switch (notification.getType()) {
            case CREDITS_WELCOME -> "Welcome! You received " + credits(params) + " to get started.";
            case CREDITS_RECEIVED -> "You received " + credits(params) + " for completing an errand.";
            case CREDITS_COMPENSATED -> "You received " + credits(params) + " as compensation for a cancelled errand.";
            case CHAT_MESSAGE_RECEIVED -> chatPreview(params);
            case ORDER_OPENED -> "Your errand " + title(params) + " is live. Couriers can now accept it.";
            case ORDER_RESERVATION_FAILED -> "Your errand " + title(params) + " couldn't be posted: "
                    + reservationFailure(params) + ".";
            case ORDER_ACCEPTED -> "A courier accepted your errand " + title(params) + ".";
            case ORDER_COURIER_WITHDREW -> "Your courier withdrew from " + title(params)
                    + ". It's open for other couriers again.";
            case ORDER_EXPIRED -> "Your errand " + title(params)
                    + " expired before pickup. Your reserved credits are being returned.";
            case ORDER_CANCELLED -> "The requester cancelled " + title(params) + ".";
            case ORDER_PICKED_UP -> "Your courier picked up " + title(params) + ".";
            case ORDER_DELIVERED -> "Your courier delivered " + title(params) + ". Please confirm you received it.";
            case ORDER_COMPLETED -> "The requester confirmed they received " + title(params) + ".";
            case ORDER_STILL_OPEN -> "Nobody has accepted " + title(params) + " yet, and pickup closes at "
                    + deadline(params) + ". Raising the reward or moving the pickup time later can help a courier"
                    + " take it.";
            case PICKUP_DUE_SOON -> "Pick up " + title(params) + " by " + deadline(params)
                    + ", about 15 minutes from now.";
            case PICKUP_OVERDUE -> "You're past the pickup time for " + title(params)
                    + ". Pick it up now, or withdraw so it can reopen.";
        };
    }

    private static String title(JsonNode params) {
        return "\"" + params.path("title").asString() + "\"";
    }

    /** Only approved Credit codes are shown in words; anything else gets the generic reason. */
    private static String reservationFailure(JsonNode params) {
        return switch (params.path("reason").asString()) {
            case "INSUFFICIENT_CREDITS" -> "you don't have enough credits";
            case "CREDIT_ACCOUNT_NOT_FOUND" -> "your credit account isn't set up yet";
            case "CREDIT_RESERVATION_TIMEOUT" -> "Credit didn't confirm your credits in time";
            default -> "the credits couldn't be reserved";
        };
    }

    /** The pickup deadline in campus time, for example "3:00 pm" or "3:00 pm on 12 Nov". */
    private static String deadline(JsonNode params) {
        ZonedDateTime deadline = OffsetDateTime.parse(params.path("pickupDeadline").asString())
                .atZoneSameInstant(CAMPUS_TIME);
        ZonedDateTime remindedAt = OffsetDateTime.parse(params.path("remindedAt").asString())
                .atZoneSameInstant(CAMPUS_TIME);
        String time = deadline.format(TIME).toLowerCase(Locale.ROOT);
        return deadline.toLocalDate().equals(remindedAt.toLocalDate()) ? time : time + " on " + deadline.format(DAY);
    }

    private static String credits(JsonNode params) {
        int amount = params.path("amount").asInt();
        return amount == 1 ? "1 credit" : amount + " credits";
    }

    private static String chatPreview(JsonNode params) {
        String preview = params.path("messagePreview").asString();
        return preview == null || preview.isBlank() ? "New message in chat" : preview;
    }
}
