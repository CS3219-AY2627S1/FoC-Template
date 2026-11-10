package sg.edu.nus.foc.reporting.report;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import sg.edu.nus.foc.reporting.error.BadRequestException;
import sg.edu.nus.foc.reporting.error.ConflictException;
import sg.edu.nus.foc.reporting.error.DependencyUnavailableException;
import sg.edu.nus.foc.reporting.error.ForbiddenException;
import sg.edu.nus.foc.reporting.error.NotFoundException;
import sg.edu.nus.foc.reporting.order.AssociatedOrder;
import sg.edu.nus.foc.reporting.order.OrderAssociationClient;
import sg.edu.nus.foc.reporting.storage.AttachmentStorage;
import sg.edu.nus.foc.reporting.storage.StoredObject;

@Service
public class ReportService {
    private static final Duration RESPONSE_WINDOW = Duration.ofHours(24);
    private static final List<String> REPORTABLE_STATUSES = List.of(
            "ACCEPTED", "IN_PROGRESS", "PICKED_UP", "DELIVERED");

    private final ReportRepository repository;
    private final AttachmentStorage storage;
    private final OrderAssociationClient orders;
    private final ImageValidator images;
    private final Clock clock;
    private ReportDeadlineScheduler deadlines;
    @org.springframework.beans.factory.annotation.Autowired
    public void setDeadlines(ReportDeadlineScheduler deadlines) { this.deadlines=deadlines; }

    public ReportService(ReportRepository repository, AttachmentStorage storage,
                         OrderAssociationClient orders, ImageValidator images, Clock clock) {
        this.repository = repository;
        this.storage = storage;
        this.orders = orders;
        this.images = images;
        this.clock = clock;
    }

    /** Legacy package-private test seam. Production creation is exclusively ReportCreationCoordinator. */
    Report submit(String reporterId, String bearerToken, ReportCategory category,
                         String description, String requestedOrderId, List<MultipartFile> photos) {
        if (category != ReportCategory.ORDER && category != ReportCategory.ERRAND && category != ReportCategory.GENERAL) {
            throw new BadRequestException("Choose Order, Errand or General for a new report.", "category");
        }
        String orderId = normalize(requestedOrderId);
        if (category.requiresOrder() && orderId == null) {
            throw new BadRequestException("An active order is required for this category.", "orderId");
        }
        if (!category.requiresOrder() && orderId != null) {
            throw new BadRequestException("This category cannot be linked to an order.", "orderId");
        }

        List<ImageValidator.ValidatedImage> validated = images.validate(photos);
        String reportId = UUID.randomUUID().toString();
        var uploadAttempts = new ArrayList<String>();
        try {
            List<Attachment> attachments = upload(reportId, "submission", validated, uploadAttempts);
            AssociatedOrder associated = orderId == null ? null
                    : orders.placeReportHold(orderId, reportId, reportId, true, bearerToken,
                            category == ReportCategory.ERRAND ? "COURIER" : "REQUESTER");
            if (associated != null) validateHold(associated, reporterId, reportId, category);

            Instant createdAt = clock.instant();
            String courierId = associated == null ? null : normalize(associated.courierId());
            boolean awaitingCourier = courierId != null;
            Report report = new Report(reportId, reporterId, category, description.strip(),
                    associated == null ? null : associated.id(), courierId,
                    awaitingCourier ? ReportStatus.AWAITING_COURIER_RESPONSE : ReportStatus.READY_FOR_REVIEW,
                    createdAt, awaitingCourier ? createdAt.plus(RESPONSE_WINDOW) : null,
                    null, null, null, attachments, List.of(), null, null,
                    associated == null ? null : associated.requesterId());
            return repository.saveNewLinked(report);
        } catch (RuntimeException failure) {
            cleanup(uploadAttempts);
            if (failure instanceof BadRequestException || failure instanceof NotFoundException
                    || failure instanceof ConflictException || failure instanceof ForbiddenException
                    || failure instanceof DependencyUnavailableException) throw failure;
            throw new DependencyUnavailableException("The report could not be saved.", failure);
        }
    }

    public PageResult<Report> list(int page, int size) {
        return reconcile(repository.findAll(page, size));
    }

    public PageResult<Report> list(int page, int size, String orderId, ReportStatus status) {
        if (deadlines != null) deadlines.reconcileDue();
        return reconcile(repository.findAll(page, size, orderId, status));
    }

    public PageResult<Report> listMine(String callerId, String view, int page, int size) {
        if (deadlines != null) deadlines.reconcileDue();
        PageResult<Report> result = switch (view) {
            case "submitted" -> repository.findByReporterId(callerId, page, size);
            case "against-me" -> repository.findByRespondentId(callerId, page, size);
            default -> throw new BadRequestException("View must be submitted or against-me.", "view");
        };
        return reconcile(result);
    }

    public long awaitingResponseCount(String callerId) {
        if (deadlines != null) deadlines.reconcileDue();
        return repository.countAwaitingResponse(callerId, clock.instant());
    }

    public Report detail(String id, String callerId, boolean admin) {
        Report report = reconcileOne(id);
        if (!admin && !report.participant(callerId)) {
            throw new ForbiddenException("Only report participants can view this report.");
        }
        return report;
    }

    public Report respond(String id, String callerId, String explanation, List<MultipartFile> photos) {
        List<ImageValidator.ValidatedImage> validated = images.validate(photos);
        var uploadAttempts = new ArrayList<String>();
        try {
            List<Attachment> attachments = upload(id, "response", validated, uploadAttempts);
            return repository.update(id, current -> current.respond(callerId, explanation.strip(),
                            clock.instant(), attachments))
                    .orElseThrow(() -> new NotFoundException("Report not found."));
        } catch (RuntimeException failure) {
            cleanup(uploadAttempts);
            if (failure instanceof BadRequestException || failure instanceof NotFoundException
                    || failure instanceof ConflictException || failure instanceof ForbiddenException
                    || failure instanceof DependencyUnavailableException) throw failure;
            throw new DependencyUnavailableException("The response could not be saved.", failure);
        }
    }

    public Report resolve(String id, String bearerToken) {
        throw new ConflictException("Resolve this report with a reply and stable command ID through the resolution coordinator.");
    }

    public AttachmentDownload attachment(String reportId, String attachmentId,
                                         String callerId, boolean admin) {
        Report report = detail(reportId, callerId, admin);
        Attachment metadata = java.util.stream.Stream.concat(
                        report.attachments().stream(), report.responseAttachments().stream())
                .filter(item -> item.id().equals(attachmentId)).findFirst()
                .orElseThrow(() -> new NotFoundException("Attachment not found."));
        StoredObject object = storage.get(metadata.objectKey());
        return new AttachmentDownload(metadata, object.bytes());
    }

    private PageResult<Report> reconcile(PageResult<Report> page) {
        List<Report> items = page.items().stream().map(item -> repository.update(item.id(),
                        current -> current.reconcile(clock.instant())).orElse(item)).toList();
        return new PageResult<>(items, page.page(), page.size(), page.totalItems(), page.totalPages());
    }

    private Report reconcileOne(String id) {
        return repository.update(id, current -> current.reconcile(clock.instant()))
                .orElseThrow(() -> new NotFoundException("Report not found."));
    }

    private List<Attachment> upload(String reportId, String section,
                                    List<ImageValidator.ValidatedImage> validated,
                                    List<String> uploadAttempts) {
        var attachments = new ArrayList<Attachment>();
        for (var image : validated) {
            String attachmentId = UUID.randomUUID().toString();
            String key = "reports/" + reportId + "/" + section + "/" + attachmentId;
            uploadAttempts.add(key);
            storage.put(key, image.contentType(), image.bytes());
            attachments.add(new Attachment(attachmentId, key, image.filename(), image.contentType(),
                    image.bytes().length, clock.instant()));
        }
        return List.copyOf(attachments);
    }

    private void cleanup(List<String> keys) {
        keys.forEach(key -> {
            try { storage.delete(key); }
            catch (RuntimeException ignored) { /* preserve the original failure */ }
        });
    }

    private static void validateHold(AssociatedOrder order, String reporterId, String reportId, ReportCategory category) {
        if (order == null || order.requesterId() == null
                || !reporterId.equals(category == ReportCategory.ERRAND ? order.courierId() : order.requesterId())
                || !reportId.equals(order.reportId()) || !order.isCompletionHold()
                || !REPORTABLE_STATUSES.contains(order.status())) {
            throw new DependencyUnavailableException("Order Service returned an invalid report hold.");
        }
        if (normalize(order.courierId()) == null) {
            throw new ConflictException("A courier must be assigned before they can be reported.");
        }
    }

    private static String normalize(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    public record AttachmentDownload(Attachment metadata, byte[] bytes) {
        public AttachmentDownload { bytes = bytes.clone(); }
    }
}
