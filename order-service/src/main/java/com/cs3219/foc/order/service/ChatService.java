package com.cs3219.foc.order.service;

import static com.cs3219.foc.order.model.entity.ErrandStatus.*;

import com.cs3219.foc.order.config.DeliveryPhotoStorageProperties;
import com.cs3219.foc.order.exception.OrderConflictException;
import com.cs3219.foc.order.exception.OrderNotFoundException;
import com.cs3219.foc.order.infrastructure.storage.DeliveryPhotoStorage;
import com.cs3219.foc.order.model.dto.ChatDto;
import com.cs3219.foc.order.model.dto.ErrandMessageDto;
import com.cs3219.foc.order.model.dto.SendMessageRequest;
import com.cs3219.foc.order.model.dto.event.ErrandChatReadEvent;
import com.cs3219.foc.order.model.dto.event.ErrandMessagePostedEvent;
import com.cs3219.foc.order.model.entity.AttachmentType;
import com.cs3219.foc.order.model.entity.Errand;
import com.cs3219.foc.order.model.entity.ErrandChatRead;
import com.cs3219.foc.order.model.entity.ErrandMessage;
import com.cs3219.foc.order.model.entity.ErrandStatus;
import com.cs3219.foc.order.repository.ErrandChatReadRepository;
import com.cs3219.foc.order.repository.ErrandMessageRepository;
import com.cs3219.foc.order.repository.ErrandRepository;
import com.cs3219.foc.order.security.CurrentUserService;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

/**
 * Chat between an errand's requester and courier. It opens when a courier accepts and closes when the requester
 * confirms receipt; the history stays readable afterwards. Messages are text, a photo or a video. New messages and
 * read receipts are published as events, which the realtime service pushes to both people's browsers.
 */
@Service
public class ChatService {
    /** The chat is open while the courier is working on the errand. */
    public static final Set<ErrandStatus> OPEN_STATUSES = Set.of(ACCEPTED, PICKED_UP, DELIVERED);

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    private final ErrandRepository errands;
    private final ErrandMessageRepository messages;
    private final ErrandChatReadRepository reads;
    private final CurrentUserService currentUserService;
    private final DeliveryPhotoProcessor photoProcessor;
    private final ChatVideoValidator videoValidator;
    private final DeliveryPhotoStorage storage;
    private final DeliveryPhotoStorageProperties storageProperties;
    private final ApplicationEventPublisher events;
    private final Clock clock;
    private final TransactionTemplate transactions;

    public ChatService(
            ErrandRepository errands,
            ErrandMessageRepository messages,
            ErrandChatReadRepository reads,
            CurrentUserService currentUserService,
            DeliveryPhotoProcessor photoProcessor,
            ChatVideoValidator videoValidator,
            DeliveryPhotoStorage storage,
            DeliveryPhotoStorageProperties storageProperties,
            ApplicationEventPublisher events,
            Clock clock,
            PlatformTransactionManager transactionManager) {
        this.errands = errands;
        this.messages = messages;
        this.reads = reads;
        this.currentUserService = currentUserService;
        this.photoProcessor = photoProcessor;
        this.videoValidator = videoValidator;
        this.storage = storage;
        this.storageProperties = storageProperties;
        this.events = events;
        this.clock = clock;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    /** The conversation, oldest first, with read positions, for the requester, the courier or an admin. */
    public ChatDto chat(UUID errandId) {
        var actor = currentUserService.requireCurrentUser();
        var lifetime = storageProperties.readUrlTtl();
        var expiresAt = now().plus(lifetime);
        return transactions.execute(tx -> {
            Errand errand = find(errandId);
            if (!actor.hasRole("ADMIN") && !isParticipant(errand, actor.userId()))
                throw new AccessDeniedException("Only the requester or courier can read this chat");
            var list = messages.findByErrandIdOrderBySentAtAscIdAsc(errandId).stream()
                    .map(message -> toDto(message, lifetime, expiresAt))
                    .toList();
            var positions = reads.findByErrandId(errandId).stream()
                    .map(read -> new ChatDto.Read(read.getUserId(), read.getLastReadAt()))
                    .toList();
            return new ChatDto(list, positions);
        });
    }

    /** The requester or courier sends a text message while the chat is open. Retrying the same id is safe. */
    public ErrandMessageDto send(UUID errandId, SendMessageRequest request) {
        UUID actor = currentUserService.requireCurrentUserId();
        String body = request.body().strip();
        return transactions.execute(tx -> post(errandId, request.id(), actor, body, null, null));
    }

    /**
     * Sends a photo (JPEG/PNG up to 5 MB, re-encoded without location data) or a video (MP4/MOV/WebM up to 20 MB).
     * The file is checked and stored before the message is saved; if saving fails, the file is removed again.
     */
    public ErrandMessageDto sendAttachment(UUID errandId, UUID messageId, MultipartFile file) {
        UUID actor = currentUserService.requireCurrentUserId();
        // retry of message that already saved will return it
        if (transactions.execute(tx -> messages.existsById(messageId)))
            return transactions.execute(tx -> post(errandId, messageId, actor, null, null, null));
        // check before the slow work, wrong caller or closed chat will not store anything
        transactions.executeWithoutResult(tx -> requireCanSend(find(errandId), actor));

        boolean video = file != null
                && file.getContentType() != null
                && file.getContentType().startsWith("video/");
        byte[] content;
        String contentType;
        String extension;
        if (video) {
            var checked = videoValidator.read(file);
            content = checked.bytes();
            contentType = checked.contentType();
            extension = checked.extension();
        } else {
            content = photoProcessor.toJpeg(file);
            contentType = "image/jpeg";
            extension = "jpg";
        }
        String key = "chat/%s/%s.%s".formatted(errandId, UUID.randomUUID(), extension);
        storage.put(key, content, contentType);
        try {
            var type = video ? AttachmentType.VIDEO : AttachmentType.IMAGE;
            var message = transactions.execute(tx -> post(errandId, messageId, actor, null, key, type));
            if (!key.equals(messageKey(message))) discard(key); // a retry that was already saved
            return message;
        } catch (RuntimeException exception) {
            discard(key);
            throw exception;
        }
    }

    /**
     * The reader has seen everything up to {@code messageId}. Only moves forward; the other person is told so their
     * app can show "Seen". Reading your own messages changes nothing.
     */
    public void markRead(UUID errandId, UUID messageId) {
        UUID actor = currentUserService.requireCurrentUserId();
        transactions.executeWithoutResult(tx -> {
            Errand errand = find(errandId);
            if (!isParticipant(errand, actor))
                throw new AccessDeniedException("Only the requester or courier can read this chat");
            var message = messages.findById(messageId)
                    .filter(found -> found.getErrandId().equals(errandId))
                    .orElseThrow(() -> new OrderNotFoundException(errandId));
            if (message.getSenderId().equals(actor)) return;
            var key = new ErrandChatRead.Key(errandId, actor);
            var read = reads.findById(key).orElse(null);
            if (read != null && !read.getLastReadAt().isBefore(message.getSentAt())) return;
            if (read == null) {
                read = new ErrandChatRead();
                read.setErrandId(errandId);
                read.setUserId(actor);
            }
            read.setLastReadAt(message.getSentAt());
            reads.saveAndFlush(read);
            events.publishEvent(new ErrandChatReadEvent(
                    UUID.randomUUID(),
                    1,
                    now(),
                    new ErrandChatReadEvent.Payload(errandId, actor, participants(errand), message.getSentAt())));
        });
    }

    /** Saves a message inside the caller's transaction, or returns the one already saved under this id. */
    private ErrandMessageDto post(
            UUID errandId, UUID messageId, UUID actor, String body, String attachmentKey, AttachmentType type) {
        // Locked so a message cannot slip in after the errand is completed.
        Errand errand = errands.findForUpdateById(errandId).orElseThrow(() -> new OrderNotFoundException(errandId));
        if (!isParticipant(errand, actor))
            throw new AccessDeniedException("Only the requester or courier can send messages");
        var lifetime = storageProperties.readUrlTtl();
        var existing = messages.findById(messageId);
        if (existing.isPresent()) {
            var message = existing.get();
            if (!message.getErrandId().equals(errandId)
                    || !message.getSenderId().equals(actor))
                throw new OrderConflictException("This message id is already used");
            return toDto(message, lifetime, now().plus(lifetime));
        }
        requireCanSend(errand, actor);

        var message = new ErrandMessage();
        message.setId(messageId);
        message.setErrandId(errandId);
        message.setSenderId(actor);
        message.setBody(body);
        message.setAttachmentKey(attachmentKey);
        message.setAttachmentType(type);
        message.setSentAt(now());
        messages.saveAndFlush(message);
        // Registered in this transaction, and sent to SNS only after it commits.
        events.publishEvent(new ErrandMessagePostedEvent(
                UUID.randomUUID(),
                1,
                message.getSentAt(),
                new ErrandMessagePostedEvent.Payload(
                        message.getId(),
                        errandId,
                        actor,
                        participants(errand),
                        body,
                        type == null ? null : type.name(),
                        message.getSentAt())));
        return toDto(message, lifetime, now().plus(lifetime));
    }

    private static void requireCanSend(Errand errand, UUID actor) {
        if (!isParticipant(errand, actor))
            throw new AccessDeniedException("Only the requester or courier can send messages");
        if (!OPEN_STATUSES.contains(errand.getStatus())) throw new OrderConflictException("This chat is closed");
    }

    private static boolean isParticipant(Errand errand, UUID userId) {
        return errand.getCourierId() != null
                && (userId.equals(errand.getRequesterId()) || userId.equals(errand.getCourierId()));
    }

    private static List<UUID> participants(Errand errand) {
        return List.of(errand.getRequesterId(), errand.getCourierId());
    }

    private ErrandMessageDto toDto(ErrandMessage message, Duration lifetime, OffsetDateTime expiresAt) {
        var attachment = message.getAttachmentKey() == null
                ? null
                : new ErrandMessageDto.Attachment(
                        message.getAttachmentType().name(),
                        storage.readUrl(message.getAttachmentKey(), lifetime),
                        expiresAt);
        return new ErrandMessageDto(
                message.getId(),
                message.getErrandId(),
                message.getSenderId(),
                message.getBody(),
                attachment,
                message.getSentAt());
    }

    // storage key included with the returned message, to distinguish newly saved data from previous one
    private String messageKey(ErrandMessageDto message) {
        return messages.findById(message.id())
                .map(ErrandMessage::getAttachmentKey)
                .orElse(null);
    }

    // remove the stored file that is no longer used
    private void discard(String key) {
        try {
            storage.delete(key);
        } catch (RuntimeException exception) {
            log.warn("Could not remove unused chat file {}", key, exception);
        }
    }

    private Errand find(UUID errandId) {
        return errands.findById(errandId).orElseThrow(() -> new OrderNotFoundException(errandId));
    }

    private OffsetDateTime now() {
        return OffsetDateTime.ofInstant(clock.instant().truncatedTo(ChronoUnit.MICROS), ZoneOffset.UTC);
    }
}
