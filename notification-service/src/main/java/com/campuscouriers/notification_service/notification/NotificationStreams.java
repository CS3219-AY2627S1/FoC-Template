package com.campuscouriers.notification_service.notification;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter.SseEventBuilder;

@Component
public class NotificationStreams {
    private static final int MAX_PENDING_EVENTS = 32;

    private final Map<UUID, Set<Connection>> connections = new ConcurrentHashMap<>();
    private final Executor writers;

    public NotificationStreams(@Qualifier("notificationStreamExecutor") Executor writers) {
        this.writers = writers;
    }

    public SseEmitter open(UUID recipientId, Instant expiresAt) throws IOException {
        long timeout = Math.max(1, Duration.between(Instant.now(), expiresAt).toMillis());
        SseEmitter emitter = new SseEmitter(timeout);
        Connection connection = new Connection(recipientId, expiresAt, emitter);
        emitter.onCompletion(connection::remove);
        emitter.onError(error -> connection.remove());
        emitter.onTimeout(connection::close);

        // Spring buffers this initial event until the response is ready.
        emitter.send(SseEmitter.event().name("connected").data("{}"));
        connections.compute(recipientId, (ignored, group) -> {
            Set<Connection> active = group == null ? ConcurrentHashMap.newKeySet() : group;
            active.add(connection);
            return active;
        });
        return emitter;
    }

    @Scheduled(fixedRate = 15_000)
    void heartbeat() {
        connections.values().forEach(group ->
            group.forEach(connection -> connection.enqueue(SseEmitter.event().comment("heartbeat"))));
    }

    @TransactionalEventListener
    void deliver(NotificationSaved saved) {
        Set<Connection> recipients = connections.get(saved.recipientId());
        if (recipients != null) {
            NotificationResponse notification = saved.notification();
            recipients.forEach(connection -> connection.enqueue(SseEmitter.event()
                .id(notification.id().toString()).name("notification")
                .data(notification, MediaType.APPLICATION_JSON)));
        }
    }

    private final class Connection {
        private final UUID recipientId;
        private final Instant expiresAt;
        private final SseEmitter emitter;
        private final Queue<SseEventBuilder> pending = new ArrayDeque<>();
        private boolean writing;
        private boolean closed;
        private boolean reconnectRequired;

        private Connection(UUID recipientId, Instant expiresAt, SseEmitter emitter) {
            this.recipientId = recipientId;
            this.expiresAt = expiresAt;
            this.emitter = emitter;
        }

        synchronized void enqueue(SseEventBuilder event) {
            if (closed) {
                return;
            }
            if (!reconnectRequired) {
                if (pending.size() == MAX_PENDING_EVENTS) {
                    reconnectRequired = true;
                    pending.clear();
                } else {
                    pending.add(event);
                }
            }
            if (!writing) {
                writing = true;
                try {
                    writers.execute(this::writePending);
                } catch (RejectedExecutionException ignored) {
                    // The next heartbeat can retry scheduling this bounded queue.
                    writing = false;
                }
            }
        }

        private void writePending() {
            while (true) {
                SseEventBuilder event;
                boolean reconnect;
                synchronized (this) {
                    event = pending.poll();
                    reconnect = reconnectRequired;
                    if (event == null) {
                        writing = false;
                    }
                }
                if (reconnect || !expiresAt.isAfter(Instant.now())) {
                    close();
                    return;
                }
                if (event == null) {
                    return;
                }
                try {
                    emitter.send(event);
                } catch (IOException | IllegalStateException disconnected) {
                    remove();
                    return;
                }
            }
        }

        private void close() {
            remove();
            emitter.complete();
        }

        private void remove() {
            synchronized (this) {
                closed = true;
                pending.clear();
            }
            connections.computeIfPresent(recipientId, (ignored, group) -> {
                group.remove(this);
                return group.isEmpty() ? null : group;
            });
        }
    }
}
