/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation implementation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.report;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import sg.edu.nus.foc.reporting.error.*;
import sg.edu.nus.foc.reporting.order.AssociatedOrder;
import sg.edu.nus.foc.reporting.order.OrderAssociationClient;
import sg.edu.nus.foc.reporting.storage.AttachmentStorage;
import sg.edu.nus.foc.reporting.creation.CreationCompensationMessages;
import sg.edu.nus.foc.reporting.creation.CreationSettings;

@Service
public class ReportCreationCoordinator {
    private static final Logger log = LoggerFactory.getLogger(ReportCreationCoordinator.class);
    private static final Duration RESPONSE_WINDOW = Duration.ofHours(24);
    private static final List<String> REPORTABLE = List.of("ACCEPTED", "IN_PROGRESS", "PICKED_UP", "DELIVERED");
    private final ReportSubmissionStore submissions;
    private final ReportRepository reports;
    private final AttachmentStorage storage;
    private final OrderAssociationClient orders;
    private final ImageValidator images;
    private final Clock clock;
    private final Duration holdLease;
    private final CreationSettings settings;

    public ReportCreationCoordinator(ReportSubmissionStore submissions, ReportRepository reports,
            AttachmentStorage storage, OrderAssociationClient orders, ImageValidator images, Clock clock,
            @Value("${REPORT_CREATION_HOLD_LEASE:2m}") Duration holdLease, CreationSettings settings) {
        this.submissions=submissions; this.reports=reports; this.storage=storage; this.orders=orders;
        this.images=images; this.clock=clock; this.holdLease=holdLease;this.settings=settings;
        if (holdLease.isNegative() || holdLease.isZero() || holdLease.compareTo(Duration.ofMinutes(10)) > 0)
            throw new IllegalArgumentException("Report creation hold lease must be between zero and ten minutes.");
    }

    public record Outcome(ReportSubmission submission, Report report, boolean created) {
        public boolean completed() { return submission.state() == ReportSubmissionState.COMPLETED; }
    }

    public Outcome submit(String submissionId, String reporterId, String bearerToken,
                          ReportCategory category, String description, String requestedOrderId,
                          List<MultipartFile> photos) {
        validateCategory(category, requestedOrderId);
        if(category.requiresOrder()&&!settings.enabled())throw new DependencyUnavailableException("Durable linked report creation is not enabled.");
        String orderId = normalize(requestedOrderId);
        String normalizedDescription = ReportSubmissionFingerprint.normalizeDescription(description);
        if (normalizedDescription.isBlank()) throw new BadRequestException("Description must not be blank.", "description");
        ReportSubmission previous = existing(submissionId, reporterId);
        List<ImageValidator.ValidatedImage> validated = images.validate(photos);
        boolean reuseStoredManifest = previous != null && validated.isEmpty() && !previous.attachments().isEmpty()
                && previous.state() != ReportSubmissionState.RECEIVED;
        var manifest = reuseStoredManifest ? previous.attachments() : manifest(submissionId, validated);
        String fingerprint = ReportSubmissionFingerprint.create(reporterId, category, orderId,
                normalizedDescription, manifest.stream().map(a -> new ReportSubmissionFingerprint.AttachmentInput(
                        a.index(), a.filename(), a.size(), a.contentType(), a.sha256())).toList());
        var begin = submissions.begin(submissionId, reporterId, fingerprint, category, orderId,
                normalizedDescription, manifest);
        ReportSubmission saved = begin.submission();
        if (saved.state() == ReportSubmissionState.COMPLETED) {
            return new Outcome(saved, reports.findById(saved.reportId()).orElseThrow(
                    () -> new DependencyUnavailableException("Completed submission is missing its report.")), false);
        }
        if (saved.state() == ReportSubmissionState.COMPENSATING) return new Outcome(saved, null, false);
        if (saved.terminal() || saved.fenced()) throw new ConflictException("This submission is fenced and cannot be resumed.");
        if (saved.state() == ReportSubmissionState.HOLD_PENDING) {
            if (saved.leaseUntil() != null && !saved.leaseUntil().isAfter(clock.instant())) {
                saved = submissions.compensateExpiredHold(submissionId, "HOLD_LEASE_EXPIRED").orElse(saved);
            }
            return new Outcome(saved, null, false);
        }
        if (!reuseStoredManifest) {
            try {
                upload(saved, validated, reporterId);
            } catch (RuntimeException uploadFailure) {
                String reason = normalize(uploadFailure.getMessage());
                ReportSubmission rejected = submissions.rejectPreHold(submissionId, reporterId,
                        reason == null ? "Evidence upload failed." : reason);
                if (rejected.state() == ReportSubmissionState.REJECTED) cleanupBestEffort(rejected);
                throw uploadFailure;
            }
        }
        saved = submissions.evidenceStored(submissionId, reporterId);
        if (category == ReportCategory.GENERAL) {
            Report report = build(saved, null);
            var completion = submissions.complete(submissionId, reporterId, report);
            return new Outcome(completion.submission(), report, completion.activated());
        }
        var lease = submissions.acquireHoldLease(submissionId, reporterId, clock.instant().plus(holdLease));
        saved = lease.submission();
        if (!lease.acquired()) return new Outcome(saved, null, false);
        try {
            AssociatedOrder associated = orders.placeReportHold(orderId, saved.reportId(), submissionId,
                    true, bearerToken, category == ReportCategory.ERRAND ? "COURIER" : "REQUESTER");
            validateHold(associated, reporterId, saved.reportId(), category);
            Report report = build(saved, associated);
            try {
                var completion = submissions.complete(submissionId, reporterId, report);
                return new Outcome(completion.submission(), report, completion.activated());
            } catch (RuntimeException activationFailure) {
                ReportSubmission compensating = submissions.compensate(submissionId, reporterId,
                        "REPORT_ACTIVATION_FAILED");
                Report committed = compensating.state() == ReportSubmissionState.COMPLETED
                        ? reports.findById(compensating.reportId()).orElse(null) : null;
                return new Outcome(compensating, committed, false);
            }
        } catch (BadRequestException | NotFoundException | ConflictException | ForbiddenException definitive) {
            // The Order contract guarantees these responses precede hold creation.
            ReportSubmission rejected = submissions.rejectPreHold(submissionId, reporterId, definitive.getMessage());
            if (rejected.state() == ReportSubmissionState.REJECTED) cleanupBestEffort(rejected);
            throw definitive;
        } catch (RuntimeException uncertain) {
            ReportSubmission compensating = submissions.compensate(submissionId, reporterId,
                    "ORDER_HOLD_UNCERTAIN");
            return new Outcome(compensating, null, false);
        }
    }

    public Outcome status(String submissionId, String callerId) {
        ReportSubmission submission = submissions.get(submissionId, callerId);
        Report report = submission.state() == ReportSubmissionState.COMPLETED
                ? reports.findById(submission.reportId()).orElse(null) : null;
        return new Outcome(submission, report, false);
    }

    public Outcome cancel(String submissionId, String callerId) {
        ReportSubmission cancelled = submissions.cancelPreHold(submissionId, callerId);
        cleanupBestEffort(cancelled);
        return new Outcome(cancelled, null, false);
    }

    public void recoverExpired(){
        for(String id:submissions.stalePreHold()){
            try{submissions.expirePreHold(id,"INACTIVE_PRE_HOLD_EXPIRED").ifPresent(this::cleanup);}
            catch(RuntimeException ignored){ }
        }
        for(String id:submissions.expiredHolds()){
            try{submissions.compensateExpiredHold(id,"HOLD_LEASE_EXPIRED");}
            catch(RuntimeException ignored){ }
        }
        for(String id:submissions.dueCleanup()){
            try{cleanup(submissions.getInternal(id));}
            catch(RuntimeException ignored){ }
        }
    }

    public ReportSubmission acceptCompensation(CreationCompensationMessages.Result result){
        ReportSubmission updated=submissions.accept(result);
        if(updated.state()==ReportSubmissionState.COMPENSATED)cleanup(updated);
        return updated;
    }

    private List<ReportSubmission.ManifestItem> manifest(String submissionId, List<ImageValidator.ValidatedImage> images) {
        var result = new ArrayList<ReportSubmission.ManifestItem>();
        for (int i=0;i<images.size();i++) {
            var image=images.get(i); String sha=ReportSubmissionFingerprint.sha256(image.bytes());
            String id=ReportSubmissionFingerprint.attachmentId(i,sha);
            result.add(new ReportSubmission.ManifestItem(i,id,"reports/pending/submission/"+submissionId+"/"+id,
                    image.filename(),image.contentType(),image.bytes().length,sha));
        }
        return List.copyOf(result);
    }

    private void upload(ReportSubmission submission, List<ImageValidator.ValidatedImage> images, String reporterId) {
        for (var item : submission.attachments()) {
            var image=images.get(item.index());
            // The stable report ID is part of the final key; the pending prefix is never used.
            storage.putDeterministic(item.objectKey(),item.contentType(),image.bytes(),item.sha256());
            submissions.activity(submission.submissionId(), reporterId);
        }
    }

    private ReportSubmission existing(String submissionId, String reporterId) {
        try { return submissions.get(submissionId, reporterId); }
        catch (NotFoundException missing) { return null; }
    }

    private Report build(ReportSubmission s, AssociatedOrder order) {
        var attachments=s.attachments().stream().map(item -> new Attachment(item.attachmentId(),
                item.objectKey(), item.filename(), item.contentType(),
                item.size(), clock.instant())).toList();
        String courier=order==null?null:normalize(order.courierId());
        boolean awaiting=order!=null && courier!=null;
        var created=clock.instant();
        return new Report(s.reportId(),s.reporterId(),s.category(),s.description(),order==null?null:order.id(),courier,
                awaiting?ReportStatus.AWAITING_COURIER_RESPONSE:ReportStatus.READY_FOR_REVIEW,created,
                awaiting?created.plus(RESPONSE_WINDOW):null,null,null,null,attachments,List.of(),null,null,
                order==null?null:order.requesterId());
    }

    private void cleanup(ReportSubmission submission) {
        for (var item : submission.attachments()) storage.delete(item.objectKey());
        submissions.cleanupCompleted(submission.submissionId());
    }

    private void cleanupBestEffort(ReportSubmission submission) {
        try {
            cleanup(submission);
        } catch (RuntimeException cleanupFailure) {
            log.warn("Report submission {} still has evidence cleanup pending", submission.submissionId(),
                    cleanupFailure);
        }
    }

    private static void validateCategory(ReportCategory category, String requestedOrderId) {
        if (category != ReportCategory.ORDER && category != ReportCategory.ERRAND && category != ReportCategory.GENERAL)
            throw new BadRequestException("Choose Order, Errand or General for a new report.", "category");
        String orderId=normalize(requestedOrderId);
        if (category.requiresOrder() && orderId==null) throw new BadRequestException("An active order is required for this category.","orderId");
        if (!category.requiresOrder() && orderId!=null) throw new BadRequestException("This category cannot be linked to an order.","orderId");
    }

    private static void validateHold(AssociatedOrder order,String reporter,String reportId,ReportCategory category) {
        if(order==null||order.requesterId()==null||!reporter.equals(category==ReportCategory.ERRAND?order.courierId():order.requesterId())
                ||!reportId.equals(order.reportId())||!order.isCompletionHold()||!REPORTABLE.contains(order.status()))
            throw new DependencyUnavailableException("Order Service returned an invalid report hold.");
        if(normalize(order.courierId())==null) throw new DependencyUnavailableException("Order Service returned an invalid report hold.");
    }
    private static String normalize(String value){return value==null||value.isBlank()?null:value.strip();}
}
