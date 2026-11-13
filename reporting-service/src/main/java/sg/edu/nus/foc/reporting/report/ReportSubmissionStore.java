/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation implementation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.report;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.*;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ExecutionException;
import org.springframework.stereotype.Service;
import sg.edu.nus.foc.reporting.creation.CreationCompensationMessages;
import sg.edu.nus.foc.reporting.error.*;
import tools.jackson.databind.json.JsonMapper;

@Service
public class ReportSubmissionStore {
    public static final String SUBMISSIONS = "report_submissions";
    public static final String OUTBOX = "report_creation_compensation_outbox";
    public static final String RESULTS = "report_creation_compensation_results";
    private static final String SLOTS = "active_report_orders";
    private static final Duration PRE_HOLD_EXPIRY = Duration.ofHours(1);
    private final Firestore db;
    private final Clock clock;
    private final JsonMapper json;

    public ReportSubmissionStore(Firestore db, Clock clock, JsonMapper json) {
        this.db = db; this.clock = clock; this.json = json;
    }

    public record Begin(ReportSubmission submission, boolean created) { }
    public record Completion(ReportSubmission submission, boolean activated) { }
    public record Claim(String id, String owner, String payload, long attempt) { }
    public record Lease(ReportSubmission submission, boolean acquired) { }

    public Begin begin(String submissionId, String reporterId, String fingerprint,
                       ReportCategory category, String orderId, String description,
                       List<ReportSubmission.ManifestItem> manifest) {
        requireUuid(submissionId);
        return transaction(tx -> {
            var ref = submissionRef(submissionId);
            var previous = tx.get(ref).get();
            if (previous.exists()) {
                ReportSubmission saved = fromDocument(previous);
                requireCaller(saved, reporterId);
                if (!fingerprint.equals(saved.inputFingerprint())) {
                    throw new ConflictException("This submission ID belongs to different report input.");
                }
                return new Begin(saved, false);
            }
            String reportId = UUID.randomUUID().toString();
            Instant now = clock.instant();
            List<ReportSubmission.ManifestItem> storedManifest = manifest.stream().map(item ->
                    new ReportSubmission.ManifestItem(item.index(), item.attachmentId(),
                            "reports/" + reportId + "/submission/" + item.attachmentId(), item.filename(),
                            item.contentType(), item.size(), item.sha256())).toList();
            ReportSubmission created = new ReportSubmission(submissionId, reportId, reporterId,
                    fingerprint, category, orderId, description, storedManifest,
                    ReportSubmissionState.RECEIVED, false, 0, 0, null, null,
                    null, null, null, null, now, now);
            if (orderId != null) reserve(tx, created);
            tx.create(ref, toDocument(created));
            return new Begin(created, true);
        });
    }

    public ReportSubmission get(String submissionId, String reporterId) {
        requireUuid(submissionId);
        try {
            var row = db.collection(SUBMISSIONS).document(submissionId).get().get();
            if (!row.exists()) throw new NotFoundException("Report submission not found.");
            ReportSubmission result = fromDocument(row);
            requireCaller(result, reporterId);
            return result;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); throw unavailable(e);
        } catch (ExecutionException e) { throw unavailable(e.getCause()); }
    }

    public ReportSubmission getInternal(String submissionId) {
        requireUuid(submissionId);
        try {
            var row=db.collection(SUBMISSIONS).document(submissionId).get().get();
            if(!row.exists())throw new NotFoundException("Report submission not found.");
            return fromDocument(row);
        } catch(InterruptedException e){Thread.currentThread().interrupt();throw unavailable(e);}
        catch(ExecutionException e){throw unavailable(e.getCause());}
    }

    public ReportSubmission evidenceStored(String submissionId, String reporterId) {
        return transition(submissionId, reporterId, Set.of(ReportSubmissionState.RECEIVED,
                ReportSubmissionState.EVIDENCE_STORED), ReportSubmissionState.EVIDENCE_STORED,
                null, null, false);
    }

    public ReportSubmission activity(String submissionId, String reporterId) {
        return transition(submissionId, reporterId, Set.of(ReportSubmissionState.RECEIVED,
                ReportSubmissionState.EVIDENCE_STORED), null, null, null, false);
    }

    public Lease acquireHoldLease(String submissionId, String reporterId, Instant leaseUntil) {
        return transaction(tx -> {
            var ref = submissionRef(submissionId); var row = tx.get(ref).get();
            if (!row.exists()) throw new NotFoundException("Report submission not found.");
            ReportSubmission current = fromDocument(row); requireCaller(current, reporterId);
            if (current.state() != ReportSubmissionState.EVIDENCE_STORED) return new Lease(current, false);
            ReportSubmission pending = copy(current, ReportSubmissionState.HOLD_PENDING, false,
                    leaseUntil, current.requesterId(), current.courierId(), current.orderStatus(), null);
            pending = new ReportSubmission(pending.submissionId(), pending.reportId(), pending.reporterId(),
                    pending.inputFingerprint(), pending.category(), pending.orderId(), pending.description(),
                    pending.attachments(), pending.state(), pending.fenced(), pending.revision(),
                    current.attempts() + 1, leaseUntil, pending.leaseUntil(), pending.requesterId(),
                    pending.courierId(), pending.orderStatus(), pending.lastError(), pending.createdAt(), pending.updatedAt());
            tx.set(ref, toDocument(pending));
            return new Lease(pending, true);
        });
    }

    public Completion complete(String submissionId, String reporterId, Report report) {
        return transaction(tx -> {
            var ref = submissionRef(submissionId);
            var row = tx.get(ref).get();
            if (!row.exists()) throw new NotFoundException("Report submission not found.");
            ReportSubmission current = fromDocument(row);
            requireCaller(current, reporterId);
            if (current.state() == ReportSubmissionState.COMPLETED) return new Completion(current, false);
            boolean activatable = current.state() == ReportSubmissionState.HOLD_PENDING
                    || (current.orderId() == null && current.state() == ReportSubmissionState.EVIDENCE_STORED);
            if (current.fenced() || !activatable) {
                throw new ConflictException("The report submission is fenced and cannot be completed.");
            }
            var reportRef = db.collection(FirestoreReportRepository.COLLECTION).document(current.reportId());
            if (tx.get(reportRef).get().exists()) throw new ConflictException("The report already exists with different submission state.");
            if (current.orderId() != null) {
                var slotRef = db.collection(SLOTS).document(current.orderId());
                var slot = tx.get(slotRef).get();
                if (!slot.exists() || !current.reportId().equals(slot.getString("reportId"))
                        || !current.submissionId().equals(slot.getString("submissionId"))) {
                    throw new ConflictException("The active report reservation changed.");
                }
                tx.set(slotRef, Map.of("reportId", current.reportId(), "submissionId", current.submissionId(), "state", "ACTIVE"));
            }
            tx.create(reportRef, FirestoreReportRepository.toDocument(report));
            ReportSubmission completed = copy(current, ReportSubmissionState.COMPLETED, false,
                    null, report.requesterId(), report.courierId(), null, null);
            tx.set(ref, toDocument(completed));
            return new Completion(completed, true);
        });
    }

    public ReportSubmission rejectPreHold(String submissionId, String reporterId, String reason) {
        return transaction(tx -> rejectPreHold(tx, submissionId, reporterId, reason));
    }

    public ReportSubmission cancelPreHold(String submissionId, String reporterId) {
        return transaction(tx -> {
            var ref = submissionRef(submissionId); var row = tx.get(ref).get();
            if (!row.exists()) throw new NotFoundException("Report submission not found.");
            ReportSubmission current = fromDocument(row); requireCaller(current, reporterId);
            if (!Set.of(ReportSubmissionState.RECEIVED, ReportSubmissionState.EVIDENCE_STORED).contains(current.state())) {
                throw new ConflictException("This submission can no longer be cancelled.");
            }
            return rejectPreHold(tx, submissionId, reporterId, "CANCELLED_BY_REPORTER");
        });
    }

    public Optional<ReportSubmission> expirePreHold(String submissionId, String reason) {
        return transaction(tx -> {
            var ref = submissionRef(submissionId); var row = tx.get(ref).get();
            if (!row.exists()) return Optional.empty();
            ReportSubmission current = fromDocument(row);
            if (!Set.of(ReportSubmissionState.RECEIVED, ReportSubmissionState.EVIDENCE_STORED).contains(current.state())
                    || current.updatedAt().isAfter(clock.instant().minus(PRE_HOLD_EXPIRY))) return Optional.empty();
            return Optional.of(rejectPreHold(tx, submissionId, current.reporterId(), reason));
        });
    }

    public Optional<ReportSubmission> compensateExpiredHold(String submissionId, String reason) {
        return transaction(tx -> {
            var ref = submissionRef(submissionId); var row = tx.get(ref).get();
            if (!row.exists()) return Optional.empty();
            ReportSubmission current = fromDocument(row);
            if (current.state() != ReportSubmissionState.HOLD_PENDING || current.leaseUntil() == null
                    || current.leaseUntil().isAfter(clock.instant())) return Optional.empty();
            return Optional.of(compensate(tx, current, reason));
        });
    }

    public ReportSubmission compensate(String submissionId, String reporterId, String reason) {
        return transaction(tx -> {
            var ref = submissionRef(submissionId);
            var row = tx.get(ref).get();
            if (!row.exists()) throw new NotFoundException("Report submission not found.");
            ReportSubmission current = fromDocument(row);
            requireCaller(current, reporterId);
            if (current.state() == ReportSubmissionState.COMPLETED) return current;
            if (current.orderId() == null) return rejectPreHold(tx, submissionId, reporterId, reason);
            return compensate(tx, current, reason);
        });
    }

    private ReportSubmission compensate(Transaction tx, ReportSubmission current, String reason) throws Exception {
        if (current.state() == ReportSubmissionState.COMPENSATED
                || current.state() == ReportSubmissionState.RECONCILIATION_REQUIRED
                || current.state() == ReportSubmissionState.COMPENSATING) return current;
        String eventId = compensationId(current.submissionId());
        var event = new CreationCompensationMessages.Request(eventId, current.submissionId(),
                current.reportId(), current.orderId(), current.reporterId(), 2);
        var outbox = db.collection(OUTBOX).document(eventId);
        boolean createOutbox = !tx.get(outbox).get().exists();
        ReportSubmission fenced = copy(current, ReportSubmissionState.COMPENSATING, true,
                null, current.requesterId(), current.courierId(), current.orderStatus(), reason);
        tx.set(submissionRef(current.submissionId()), toDocument(fenced));
        if (createOutbox) {
            Map<String,Object> data = new HashMap<>();
            data.put("payload", json.writeValueAsString(event)); data.put("state", "PENDING");
            data.put("attempts", 0L); data.put("nextAttemptAt", clock.millis());
            data.put("createdAt", timestamp(clock.instant()));
            tx.create(outbox, data);
        }
        return fenced;
    }

    public ReportSubmission accept(CreationCompensationMessages.Result result) {
        return transaction(tx -> {
            String expectedResult=result==null?null:UUID.nameUUIDFromBytes(("ReportCreationCompensationResult:"+result.compensationId()).getBytes(StandardCharsets.UTF_8)).toString();
            if (result == null || result.generation() != 2 || !compensationId(result.submissionId()).equals(result.compensationId())
                    || !expectedResult.equals(result.eventId()) || !Set.of("RELEASED","ALREADY_RELEASED","NOT_FOUND","BINDING_MISMATCH","RECONCILIATION_REQUIRED").contains(result.outcome())) {
                throw new BadRequestException("Invalid creation compensation result.", null);
            }
            var ref = submissionRef(result.submissionId());
            var row = tx.get(ref).get();
            if (!row.exists()) throw new NotFoundException("Report submission not found.");
            ReportSubmission current = fromDocument(row);
            if (!Objects.equals(current.reportId(), result.reportId()) || !Objects.equals(current.orderId(), result.orderId())
                    || !Objects.equals(current.reporterId(), result.reporterId()) || !current.fenced()) {
                throw new ConflictException("Creation compensation result binding conflicts.");
            }
            var resultRef = db.collection(RESULTS).document(result.eventId());
            var priorResult = tx.get(resultRef).get();
            Map<String,Object> resultDocument = Map.of("compensationId", result.compensationId(),
                    "submissionId", result.submissionId(), "reportId", result.reportId(),
                    "orderId", result.orderId(), "reporterId", result.reporterId(),
                    "generation", result.generation(), "outcome", result.outcome());
            if (priorResult.exists()) {
                for (var binding : resultDocument.entrySet()) {
                    if (!Objects.equals(binding.getValue(), priorResult.get(binding.getKey()))) {
                        throw new ConflictException("Creation compensation result event ID has different content.");
                    }
                }
                return current;
            }
            boolean safe = Set.of("RELEASED", "ALREADY_RELEASED", "NOT_FOUND").contains(result.outcome());
            ReportSubmissionState state = safe ? ReportSubmissionState.COMPENSATED : ReportSubmissionState.RECONCILIATION_REQUIRED;
            ReportSubmission updated = copy(current, state, true, null, current.requesterId(), current.courierId(),
                    current.orderStatus(), result.outcome());
            if (safe) removeSlot(tx, current);
            tx.create(resultRef, resultDocument);
            tx.set(ref, toDocument(updated));
            return updated;
        });
    }

    public List<String> dueOutbox() {
        return queryIds(db.collection(OUTBOX).whereLessThanOrEqualTo("nextAttemptAt", clock.millis()).limit(20));
    }

    public Optional<Claim> claim(String id) {
        return transaction(tx -> {
            var ref = db.collection(OUTBOX).document(id); var row = tx.get(ref).get();
            if (!row.exists() || row.getLong("nextAttemptAt") > clock.millis()) return Optional.empty();
            String owner = UUID.randomUUID().toString(); long attempt = row.getLong("attempts") + 1;
            tx.update(ref, Map.of("owner", owner, "state", "PUBLISHING", "attempts", attempt,
                    "nextAttemptAt", clock.millis() + 120_000));
            return Optional.of(new Claim(id, owner, row.getString("payload"), attempt));
        });
    }

    public void finish(Claim claim, boolean published) {
        transaction(tx -> {
            var ref = db.collection(OUTBOX).document(claim.id()); var row = tx.get(ref).get();
            if (row.exists() && claim.owner().equals(row.getString("owner"))) {
                String state = published ? "PUBLISHED" : claim.attempt() >= 10 ? "FAILED" : "PENDING";
                tx.update(ref, Map.of("state", state, "nextAttemptAt", "PENDING".equals(state)
                        ? clock.millis() + Math.min(300_000, 1000L << Math.min(8, claim.attempt())) : Long.MAX_VALUE));
            }
            return null;
        });
    }

    public List<String> stalePreHold() {
        Instant cutoff = clock.instant().minus(PRE_HOLD_EXPIRY);
        var a = queryIds(db.collection(SUBMISSIONS).whereEqualTo("state", "RECEIVED")
                .whereLessThanOrEqualTo("updatedAt", timestamp(cutoff)).limit(100));
        var b = queryIds(db.collection(SUBMISSIONS).whereEqualTo("state", "EVIDENCE_STORED")
                .whereLessThanOrEqualTo("updatedAt", timestamp(cutoff)).limit(100));
        var result = new ArrayList<>(a); result.addAll(b); return result;
    }

    public List<String> expiredHolds() {
        return queryIds(db.collection(SUBMISSIONS).whereEqualTo("state", "HOLD_PENDING")
                .whereLessThanOrEqualTo("leaseUntil", timestamp(clock.instant())).limit(100));
    }

    public List<String> dueCleanup() {
        return queryIds(db.collection(SUBMISSIONS).whereEqualTo("cleanupPending", true).limit(100));
    }

    public void cleanupCompleted(String submissionId) {
        transaction(tx -> {
            var ref = submissionRef(submissionId); var row = tx.get(ref).get();
            if (row.exists() && Boolean.TRUE.equals(row.getBoolean("cleanupPending"))) {
                ReportSubmission current = fromDocument(row);
                if (current.state() == ReportSubmissionState.REJECTED
                        || current.state() == ReportSubmissionState.COMPENSATED) {
                    tx.update(ref, Map.of("cleanupPending", false, "updatedAt", timestamp(clock.instant())));
                }
            }
            return null;
        });
    }

    private ReportSubmission transition(String id, String caller, Set<ReportSubmissionState> allowed,
                                        ReportSubmissionState target, Instant lease, String error, boolean fenced) {
        return transaction(tx -> {
            var ref = submissionRef(id); var row = tx.get(ref).get();
            if (!row.exists()) throw new NotFoundException("Report submission not found.");
            ReportSubmission current = fromDocument(row); requireCaller(current, caller);
            if (!allowed.contains(current.state())) return current;
            ReportSubmissionState next = target == null ? current.state() : target;
            ReportSubmission updated = copy(current, next, fenced, lease, current.requesterId(),
                    current.courierId(), current.orderStatus(), error);
            tx.set(ref, toDocument(updated)); return updated;
        });
    }

    private ReportSubmission rejectPreHold(Transaction tx, String id, String caller, String reason) throws Exception {
        var ref = submissionRef(id); var row = tx.get(ref).get();
        if (!row.exists()) throw new NotFoundException("Report submission not found.");
        ReportSubmission current = fromDocument(row); requireCaller(current, caller);
        if (!Set.of(ReportSubmissionState.RECEIVED, ReportSubmissionState.EVIDENCE_STORED,
                ReportSubmissionState.HOLD_PENDING).contains(current.state())) return current;
        ReportSubmission rejected = copy(current, ReportSubmissionState.REJECTED, true, null,
                current.requesterId(), current.courierId(), current.orderStatus(), reason);
        removeSlot(tx, current); tx.set(ref, toDocument(rejected)); return rejected;
    }

    private void reserve(Transaction tx, ReportSubmission submission) throws Exception {
        var slotRef = db.collection(SLOTS).document(submission.orderId());
        var slot = tx.get(slotRef).get();
        if (slot.exists() && !submission.submissionId().equals(slot.getString("submissionId"))) {
            String previousReportId = slot.getString("reportId");
            if ("PENDING".equals(slot.getString("state")) || previousReportId == null) throw activeConflict();
            var previousReport = tx.get(db.collection(FirestoreReportRepository.COLLECTION)
                    .document(previousReportId)).get();
            if (previousReport.exists() && !"RESOLVED".equals(previousReport.getString("status"))) {
                throw activeConflict();
            }
        }
        var legacy = tx.get(db.collection(FirestoreReportRepository.COLLECTION)
                .whereEqualTo("orderId", submission.orderId())
                .whereIn("status", List.of("AWAITING_COURIER_RESPONSE", "READY_FOR_REVIEW", "OPEN")).limit(1)).get();
        if (!legacy.isEmpty()) throw activeConflict();
        tx.set(slotRef, Map.of("reportId", submission.reportId(), "submissionId", submission.submissionId(), "state", "PENDING"));
    }

    private void removeSlot(Transaction tx, ReportSubmission current) throws Exception {
        if (current.orderId() == null) return;
        var ref = db.collection(SLOTS).document(current.orderId()); var slot = tx.get(ref).get();
        if (slot.exists() && current.reportId().equals(slot.getString("reportId"))
                && current.submissionId().equals(slot.getString("submissionId"))
                && "PENDING".equals(slot.getString("state"))) tx.delete(ref);
    }

    private ReportSubmission copy(ReportSubmission s, ReportSubmissionState state, boolean fenced,
                                  Instant lease, String requester, String courier, String orderStatus, String error) {
        return new ReportSubmission(s.submissionId(), s.reportId(), s.reporterId(), s.inputFingerprint(),
                s.category(), s.orderId(), s.description(), s.attachments(), state, fenced, s.revision() + 1,
                s.attempts(), state == ReportSubmissionState.HOLD_PENDING ? lease : null,
                lease, requester, courier, orderStatus, error, s.createdAt(), clock.instant());
    }

    private static Map<String,Object> toDocument(ReportSubmission s) {
        var map = new HashMap<String,Object>();
        map.put("submissionId", s.submissionId()); map.put("reportId", s.reportId()); map.put("reporterId", s.reporterId());
        map.put("inputFingerprint", s.inputFingerprint()); map.put("category", s.category().name()); map.put("orderId", s.orderId());
        map.put("description", s.description()); map.put("state", s.state().name()); map.put("fenced", s.fenced());
        map.put("cleanupPending", s.state() == ReportSubmissionState.REJECTED
                || s.state() == ReportSubmissionState.COMPENSATED);
        map.put("revision", s.revision()); map.put("attempts", s.attempts());
        map.put("nextAttemptAt", s.nextAttemptAt() == null ? null : timestamp(s.nextAttemptAt()));
        map.put("leaseUntil", s.leaseUntil() == null ? null : timestamp(s.leaseUntil()));
        map.put("requesterId", s.requesterId()); map.put("courierId", s.courierId()); map.put("orderStatus", s.orderStatus());
        map.put("lastError", s.lastError()); map.put("createdAt", timestamp(s.createdAt())); map.put("updatedAt", timestamp(s.updatedAt()));
        map.put("attachments", s.attachments().stream().map(a -> Map.<String,Object>of("index", a.index(),
                "attachmentId", a.attachmentId(), "objectKey", a.objectKey(), "filename", a.filename(),
                "contentType", a.contentType(), "size", a.size(), "sha256", a.sha256())).toList());
        return map;
    }

    @SuppressWarnings("unchecked")
    private static ReportSubmission fromDocument(DocumentSnapshot d) {
        List<ReportSubmission.ManifestItem> manifest = ((List<Map<String,Object>>) Optional.ofNullable(d.get("attachments")).orElse(List.of()))
                .stream().map(a -> new ReportSubmission.ManifestItem(((Number)a.get("index")).intValue(),
                        (String)a.get("attachmentId"), (String)a.get("objectKey"), (String)a.get("filename"),
                        (String)a.get("contentType"), ((Number)a.get("size")).longValue(), (String)a.get("sha256"))).toList();
        return new ReportSubmission(d.getString("submissionId"), d.getString("reportId"), d.getString("reporterId"),
                d.getString("inputFingerprint"), ReportCategory.valueOf(d.getString("category")), d.getString("orderId"),
                d.getString("description"), manifest, ReportSubmissionState.valueOf(d.getString("state")),
                Boolean.TRUE.equals(d.getBoolean("fenced")), Optional.ofNullable(d.getLong("revision")).orElse(0L),
                Optional.ofNullable(d.getLong("attempts")).orElse(0L), instant(d.getTimestamp("nextAttemptAt")),
                instant(d.getTimestamp("leaseUntil")), d.getString("requesterId"), d.getString("courierId"),
                d.getString("orderStatus"), d.getString("lastError"), instant(d.getTimestamp("createdAt")), instant(d.getTimestamp("updatedAt")));
    }

    private List<String> queryIds(Query query) {
        try { return query.get().get().getDocuments().stream().map(DocumentSnapshot::getId).toList(); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw unavailable(e); }
        catch (ExecutionException e) { throw unavailable(e.getCause()); }
    }

    private DocumentReference submissionRef(String id) { return db.collection(SUBMISSIONS).document(id); }
    private static Timestamp timestamp(Instant i) { return Timestamp.ofTimeSecondsAndNanos(i.getEpochSecond(), i.getNano()); }
    private static Instant instant(Timestamp t) { return t == null ? null : t.toDate().toInstant(); }
    private static void requireCaller(ReportSubmission s, String caller) { if (!s.reporterId().equals(caller)) throw new ForbiddenException("Only the submission owner may access it."); }
    private static void requireUuid(String id) { try { if (!UUID.fromString(id).toString().equals(id)) throw new IllegalArgumentException(); } catch (RuntimeException e) { throw new BadRequestException("submissionId must be a canonical UUID.", "submissionId"); } }
    public static String compensationId(String id) { return UUID.nameUUIDFromBytes(("ReportCreationCompensationRequested:" + id).getBytes(StandardCharsets.UTF_8)).toString(); }
    private static ConflictException activeConflict() { return new ConflictException("This order has an active report. Please resolve it before proceeding."); }
    private <T> T transaction(Transaction.Function<T> work) {
        try { return db.runTransaction(work).get(); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw unavailable(e); }
        catch (ExecutionException e) {
            Throwable c=e.getCause(); while(c!=null) { if(c instanceof RuntimeException r) throw r; c=c.getCause(); }
            throw unavailable(e.getCause());
        }
    }
    private static DependencyUnavailableException unavailable(Throwable e) { return new DependencyUnavailableException("Report submission storage is unavailable.", e); }
}
