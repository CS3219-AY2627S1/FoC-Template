package com.friendoncampus.notification.retention;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.function.BiFunction;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Applies the retention policy: deletes rows strictly older than each period, in batches of
 * {@code batchSize}, each batch in its own short transaction so locks are held briefly.
 */
public class RetentionService {

    private static final Logger log = LoggerFactory.getLogger(RetentionService.class);

    private final RetentionRepository repository;
    private final RetentionProperties properties;
    private final TransactionTemplate transactions;
    private final Clock clock;

    public RetentionService(RetentionRepository repository, RetentionProperties properties,
            TransactionTemplate transactions, Clock clock) {
        this.repository = repository;
        this.properties = properties;
        this.transactions = transactions;
        this.clock = clock;
    }

    /** How many rows one run deleted. */
    public record Result(int readNotifications, int oldNotifications, int inboxRows) {
    }

    public Result run() {
        long started = System.nanoTime();
        OffsetDateTime now = OffsetDateTime.now(clock);
        Result result = new Result(
                deleteAll(now.minus(properties.readNotifications()), repository::deleteReadNotificationsBefore),
                deleteAll(now.minus(properties.allNotifications()), repository::deleteNotificationsCreatedBefore),
                deleteAll(now.minus(properties.inbox()), repository::deleteInboxRowsBefore));
        log.info("Retention run deleted readNotifications={} oldNotifications={} inboxRows={} in {} ms",
                result.readNotifications(), result.oldNotifications(), result.inboxRows(),
                Duration.ofNanos(System.nanoTime() - started).toMillis());
        return result;
    }

    private int deleteAll(OffsetDateTime cutoff, BiFunction<OffsetDateTime, Integer, Integer> deleteBatch) {
        int batchSize = properties.batchSize();
        int total = 0;
        int deleted;
        do {
            deleted = transactions.execute(status -> deleteBatch.apply(cutoff, batchSize));
            total += deleted;
        } while (deleted == batchSize);
        return total;
    }
}
