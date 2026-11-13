package com.cs3219.foc.order.service;

import static com.cs3219.foc.order.model.entity.ErrandStatus.DELIVERED;
import static com.cs3219.foc.order.model.entity.ErrandStatus.PICKED_UP;

import com.cs3219.foc.order.config.DeliveryPhotoStorageProperties;
import com.cs3219.foc.order.exception.DeliveryPhotoException;
import com.cs3219.foc.order.exception.OrderConflictException;
import com.cs3219.foc.order.exception.OrderNotFoundException;
import com.cs3219.foc.order.infrastructure.storage.DeliveryPhotoStorage;
import com.cs3219.foc.order.mapper.ErrandMapper;
import com.cs3219.foc.order.model.dto.DeliveryPhotoDto;
import com.cs3219.foc.order.model.dto.ErrandActionResponse;
import com.cs3219.foc.order.model.entity.DeliveryPhoto;
import com.cs3219.foc.order.model.entity.Errand;
import com.cs3219.foc.order.repository.DeliveryPhotoRepository;
import com.cs3219.foc.order.repository.ErrandRepository;
import com.cs3219.foc.order.security.CurrentUserService;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

/**
 * Proof of delivery: the courier reviews the photos (1 to {@value #MAX_PHOTOS}) and submits
 * at once. It gonna be fixed after submit and the requester check them before confirm receive
 */
@Service
public class DeliveryService {
    public static final int MAX_PHOTOS = 5;
    private static final Logger log = LoggerFactory.getLogger(DeliveryService.class);

    private final ErrandRepository repository;
    private final DeliveryPhotoRepository photos;
    private final CurrentUserService currentUserService;
    private final DeliveryPhotoProcessor photoProcessor;
    private final DeliveryPhotoStorage photoStorage;
    private final DeliveryPhotoStorageProperties storageProperties;
    private final ErrandMapper mapper;
    private final OrderDisputeService disputes;
    private final Clock clock;
    private final TransactionTemplate transactions;

    public DeliveryService(
            ErrandRepository repository,
            DeliveryPhotoRepository photos,
            CurrentUserService currentUserService,
            DeliveryPhotoProcessor photoProcessor,
            DeliveryPhotoStorage photoStorage,
            DeliveryPhotoStorageProperties storageProperties,
            ErrandMapper mapper,
            OrderDisputeService disputes,
            Clock clock,
            PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.photos = photos;
        this.currentUserService = currentUserService;
        this.photoProcessor = photoProcessor;
        this.photoStorage = photoStorage;
        this.storageProperties = storageProperties;
        this.mapper = mapper;
        this.disputes = disputes;
        this.clock = clock;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    // mark a picked up errand as delivered and submit all photos to confirm delivery at once
    public ErrandActionResponse deliver(UUID id, List<MultipartFile> photoFiles) {
        if (photoFiles == null || photoFiles.isEmpty() || photoFiles.size() > MAX_PHOTOS) {
            throw new DeliveryPhotoException(
                    HttpStatus.BAD_REQUEST, "Add between 1 and " + MAX_PHOTOS + " delivery photos");
        }
        UUID actor = currentUserService.requireCurrentUserId();
        // check if anything failed and not upload
        transactions.executeWithoutResult(tx -> {
            requireDeliverable(find(id), actor);
            disputes.requireNoActiveDispute(id);
        });

        // process check for every photo first, see if any photo failed
        List<byte[]> jpegs = photoFiles.stream().map(photoProcessor::toJpeg).toList();
        List<String> keys = new ArrayList<>();
        try {
            for (byte[] jpeg : jpegs) {
                String key = "delivery-photos/%s/%s.jpg".formatted(id, UUID.randomUUID());
                photoStorage.putJpeg(key, jpeg);
                keys.add(key);
            }
            Errand errand = transactions.execute(tx -> {
                var locked = repository.findForUpdateById(id).orElseThrow(() -> new OrderNotFoundException(id));
                // re-check if there has another request delivered or changed it at the same time
                requireDeliverable(locked, actor);
                disputes.requireNoActiveDispute(id);
                var now = now();
                for (int i = 0; i < keys.size(); i++) {
                    var photo = new DeliveryPhoto();
                    photo.setId(UUID.randomUUID());
                    photo.setErrandId(id);
                    photo.setPhotoKey(keys.get(i));
                    // keep the courier's order when listed
                    photo.setCreatedAt(now.plus(i, ChronoUnit.MICROS));
                    photos.save(photo);
                }
                locked.setStatus(DELIVERED);
                locked.setDeliveredAt(now);
                locked.setUpdatedAt(now);
                return repository.saveAndFlush(locked);
            });
            return mapper.toActionResponse(errand);
        } catch (RuntimeException exception) {
            keys.forEach(this::discard);
            throw exception;
        }
    }

    // Short live links for view delivered photos, for the requester, courier, admin
    public List<DeliveryPhotoDto> photos(UUID id) {
        var actor = currentUserService.requireCurrentUser();
        List<DeliveryPhoto> found = transactions.execute(tx -> {
            Errand errand = repository.findById(id).orElseThrow(() -> new OrderNotFoundException(id));
            if (!actor.hasRole("ADMIN")
                    && !actor.userId().equals(errand.getRequesterId())
                    && !actor.userId().equals(errand.getCourierId())) {
                throw new AccessDeniedException("Only the requester or courier can see the delivery photos");
            }
            return photos.findByErrandIdOrderByCreatedAtAscIdAsc(id);
        });
        var lifetime = storageProperties.readUrlTtl();
        var expiresAt = now().plus(lifetime);
        return found.stream()
                .map(photo -> new DeliveryPhotoDto(
                        photo.getId(), photoStorage.readUrl(photo.getPhotoKey(), lifetime), expiresAt))
                .toList();
    }

    private static void requireDeliverable(Errand errand, UUID actor) {
        if (!actor.equals(errand.getCourierId()))
            throw new AccessDeniedException("Only the assigned courier can mark it delivered");
        if (errand.getStatus() != PICKED_UP)
            throw new OrderConflictException("Order must be picked up before it can be delivered");
    }

    // remove those no longer used stored photo
    private void discard(String key) {
        try {
            photoStorage.delete(key);
        } catch (RuntimeException exception) {
            log.warn("Could not remove unused delivery photo {}", key, exception);
        }
    }

    private Errand find(UUID id) {
        return repository.findById(id).orElseThrow(() -> new OrderNotFoundException(id));
    }

    private OffsetDateTime now() {
        return OffsetDateTime.ofInstant(clock.instant().truncatedTo(ChronoUnit.MICROS), ZoneOffset.UTC);
    }
}
