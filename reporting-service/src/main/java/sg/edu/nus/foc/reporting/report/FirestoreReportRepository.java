/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.report;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import java.util.function.UnaryOperator;

import com.google.api.core.ApiFuture;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import org.springframework.stereotype.Repository;
import sg.edu.nus.foc.reporting.error.DependencyUnavailableException;

@Repository
public class FirestoreReportRepository implements ReportRepository {
    static final String COLLECTION = "reports";
    private final Firestore firestore;
    private String legacyCursor;

    public FirestoreReportRepository(Firestore firestore) { this.firestore = firestore; }

    @Override
    public Report save(Report report) {
        await(firestore.collection(COLLECTION).document(report.id()).set(toDocument(report)));
        return report;
    }

    @Override
    public Report saveNewLinked(Report report) {
        if (report.orderId() == null) return save(report);
        return await(firestore.runTransaction(tx -> {
            var slot = firestore.collection("active_report_orders").document(report.orderId());
            var previous = tx.get(slot).get();
            if (previous.exists()) {
                var existing = tx.get(firestore.collection(COLLECTION).document(previous.getString("reportId"))).get();
                if (existing.exists() && !"RESOLVED".equals(existing.getString("status"))) {
                    throw activeReportConflict();
                }
            }
            // Include reports created before slots existed. The slot serializes concurrent creates.
            var active = tx.get(firestore.collection(COLLECTION).whereEqualTo("orderId", report.orderId())
                    .whereIn("status", List.of("AWAITING_COURIER_RESPONSE", "READY_FOR_REVIEW", "OPEN"))
                    .limit(1)).get();
            if (!active.isEmpty()) throw activeReportConflict();
            tx.set(slot, Map.of("reportId", report.id()));
            tx.set(firestore.collection(COLLECTION).document(report.id()), toDocument(report));
            return report;
        }));
    }

    private static sg.edu.nus.foc.reporting.error.ConflictException activeReportConflict() {
        return new sg.edu.nus.foc.reporting.error.ConflictException(
                "This order has an active report. Please resolve it before proceeding.");
    }

    @Override
    public Optional<Report> findById(String id) {
        if (!validId(id)) return Optional.empty();
        DocumentSnapshot snapshot = await(firestore.collection(COLLECTION).document(id).get());
        return snapshot.exists() ? Optional.of(fromDocument(snapshot)) : Optional.empty();
    }

    @Override
    public PageResult<Report> findAll(int page, int size) {
        return findAll(page, size, null, null);
    }

    @Override
    public PageResult<Report> findAll(int page, int size, String orderId, ReportStatus status) {
        com.google.cloud.firestore.Query query = firestore.collection(COLLECTION);
        if (orderId != null && !orderId.isBlank()) query = query.whereEqualTo("orderId", orderId.strip());
        if (status == ReportStatus.READY_FOR_REVIEW) query = query.whereIn("status", List.of("READY_FOR_REVIEW", "OPEN"));
        else if (status != null) query = query.whereEqualTo("status", status.name());
        long total = await(query.count().get()).getCount();
        var rows = await(query.orderBy("createdAt", com.google.cloud.firestore.Query.Direction.DESCENDING)
                .orderBy(com.google.cloud.firestore.FieldPath.documentId(), com.google.cloud.firestore.Query.Direction.DESCENDING)
                .offset(Math.multiplyExact(page - 1, size)).limit(size).get()).getDocuments();
        return new PageResult<>(rows.stream().map(FirestoreReportRepository::fromDocument).toList(),
                page, size, total, (int)((total+size-1)/size));
    }

    @Override
    public PageResult<Report> findByReporterId(String reporterId, int page, int size) {
        List<Report> reports = await(firestore.collection(COLLECTION).whereEqualTo("reporterId", reporterId).get())
                .getDocuments().stream().map(FirestoreReportRepository::fromDocument)
                .sorted(Comparator.comparing(Report::createdAt).reversed().thenComparing(Report::id)).toList();
        return page(reports, page, size);
    }

    @Override
    public PageResult<Report> findByRespondentId(String courierId, int page, int size) {
        return page(participantReports(courierId).stream().filter(item -> courierId.equals(item.respondentId())).toList(), page, size);
    }

    private List<Report> participantReports(String callerId) {
        return await(firestore.collection(COLLECTION).where(com.google.cloud.firestore.Filter.or(
                com.google.cloud.firestore.Filter.equalTo("courierId", callerId),
                com.google.cloud.firestore.Filter.equalTo("requesterId", callerId))).get())
                .getDocuments().stream().map(FirestoreReportRepository::fromDocument)
                .sorted(Comparator.comparing(Report::createdAt).reversed().thenComparing(Report::id)).toList();
    }

    @Override
    public synchronized List<String> unresolvedErrandIds() {
        var query = firestore.collection(COLLECTION).whereEqualTo("category", "ERRAND")
                .orderBy(com.google.cloud.firestore.FieldPath.documentId()).limit(100);
        if (legacyCursor != null) query = query.startAfter(legacyCursor);
        var rows = await(query.get()).getDocuments();
        legacyCursor = rows.size() < 100 ? null : rows.getLast().getId();
        return rows.stream().filter(row -> !"RESOLVED".equals(row.getString("status"))
                && row.getTimestamp("responseDeadlineAt") == null && row.getTimestamp("respondedAt") == null)
                .map(DocumentSnapshot::getId).toList();
    }

    private static PageResult<Report> page(List<Report> reports, int page, int size) {
        int start = Math.min((page - 1) * size, reports.size());
        int end = Math.min(start + size, reports.size());
        int pages = reports.isEmpty() ? 0 : (reports.size() + size - 1) / size;
        return new PageResult<>(reports.subList(start, end), page, size, reports.size(), pages);
    }

    @Override
    public Optional<Report> update(String id, UnaryOperator<Report> operation) {
        if (!validId(id)) return Optional.empty();
        return await(firestore.runTransaction(transaction -> {
            var ref = firestore.collection(COLLECTION).document(id);
            DocumentSnapshot snapshot = transaction.get(ref).get();
            if (!snapshot.exists()) return Optional.empty();
            Report current = fromDocument(snapshot);
            Report updated = operation.apply(current);
            if (!updated.equals(current)) {
                var document = toDocument(updated);
                document.put("revision", snapshot.contains("revision") ? snapshot.getLong("revision") + 1 : 1L);
                transaction.set(ref, document);
            }
            return Optional.of(updated);
        }));
    }

    @Override
    public List<String> dueResponseIds(Instant now) {
        return await(firestore.collection(COLLECTION).whereEqualTo("status", "AWAITING_COURIER_RESPONSE")
                .whereLessThanOrEqualTo("responseDeadlineAt", timestamp(now))
                .orderBy("responseDeadlineAt").limit(100).get()).getDocuments().stream().map(DocumentSnapshot::getId).toList();
    }

    @Override
    public long countAwaitingResponse(String courierId, Instant now) {
        return participantReports(courierId).stream().filter(report -> courierId.equals(report.respondentId())
                && report.status() == ReportStatus.AWAITING_COURIER_RESPONSE && report.respondedAt() == null
                && report.responseDeadlineAt() != null && now.isBefore(report.responseDeadlineAt())).count();
    }

    static Map<String, Object> toDocument(Report report) {
        List<Map<String, Object>> attachments = report.attachments().stream().map(item -> Map.<String, Object>of(
                "id", item.id(), "objectKey", item.objectKey(), "filename", item.filename(),
                "contentType", item.contentType(), "size", item.size(),
                "uploadedAt", Timestamp.ofTimeSecondsAndNanos(item.uploadedAt().getEpochSecond(), item.uploadedAt().getNano()))).toList();
        var map = new java.util.HashMap<String, Object>();
        map.put("id", report.id()); map.put("reporterId", report.reporterId());
        map.put("requesterId", report.requesterId());
        map.put("category", report.category().name()); map.put("description", report.description());
        map.put("orderId", report.orderId()); map.put("courierId", report.courierId());
        map.put("status", report.status().name());
        map.put("resolutionNote", report.resolutionNote());
        map.put("resolvedBy", report.resolvedBy());
        map.put("createdAt", Timestamp.ofTimeSecondsAndNanos(report.createdAt().getEpochSecond(), report.createdAt().getNano()));
        map.put("responseDeadlineAt", timestamp(report.responseDeadlineAt()));
        map.put("courierResponse", report.courierResponse());
        map.put("respondedAt", timestamp(report.respondedAt()));
        map.put("resolvedAt", report.resolvedAt() == null ? null : Timestamp.ofTimeSecondsAndNanos(report.resolvedAt().getEpochSecond(), report.resolvedAt().getNano()));
        map.put("attachments", attachments);
        map.put("responseAttachments", report.responseAttachments().stream().map(FirestoreReportRepository::attachmentDocument).toList());
        return map;
    }

    private static Map<String, Object> attachmentDocument(Attachment item) {
        return Map.of("id", item.id(), "objectKey", item.objectKey(), "filename", item.filename(),
                "contentType", item.contentType(), "size", item.size(),
                "uploadedAt", Timestamp.ofTimeSecondsAndNanos(item.uploadedAt().getEpochSecond(), item.uploadedAt().getNano()));
    }

    private static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.ofTimeSecondsAndNanos(value.getEpochSecond(), value.getNano());
    }

    @SuppressWarnings("unchecked")
    static Report fromDocument(DocumentSnapshot snapshot) {
        List<Attachment> attachments = attachments(snapshot.get("attachments"));
        List<Attachment> responseAttachments = attachments(snapshot.get("responseAttachments"));
        Timestamp created = snapshot.getTimestamp("createdAt");
        Timestamp deadline = snapshot.getTimestamp("responseDeadlineAt");
        Timestamp responded = snapshot.getTimestamp("respondedAt");
        Timestamp resolved = snapshot.getTimestamp("resolvedAt");
        String rawStatus = snapshot.getString("status");
        ReportStatus status = "OPEN".equals(rawStatus) ? ReportStatus.READY_FOR_REVIEW : ReportStatus.valueOf(rawStatus);
        return new Report(snapshot.getId(), snapshot.getString("reporterId"),
                ReportCategory.valueOf(snapshot.getString("category")), snapshot.getString("description"),
                snapshot.getString("orderId"), snapshot.getString("courierId"), status,
                created.toDate().toInstant(), deadline == null ? null : deadline.toDate().toInstant(),
                snapshot.getString("courierResponse"), responded == null ? null : responded.toDate().toInstant(),
                resolved == null ? null : resolved.toDate().toInstant(), attachments, responseAttachments,
                snapshot.getString("resolutionNote"), snapshot.getString("resolvedBy"), snapshot.getString("requesterId"));
    }

    private static List<Attachment> attachments(Object raw) {
        List<Attachment> attachments = new ArrayList<>();
        if (raw instanceof List<?> list) for (Object entry : list) if (entry instanceof Map<?, ?> item) {
            Timestamp uploaded = (Timestamp) item.get("uploadedAt");
            attachments.add(new Attachment((String) item.get("id"), (String) item.get("objectKey"),
                    (String) item.get("filename"), (String) item.get("contentType"),
                    ((Number) item.get("size")).longValue(), uploaded.toDate().toInstant()));
        }
        return attachments;
    }

    static boolean validId(String id) { return id != null && !id.isBlank() && !id.contains("/"); }
    private static <T> T await(ApiFuture<T> future) {
        try { return future.get(); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new DependencyUnavailableException("Report storage is unavailable.", e); }
        catch (ExecutionException e) {
            for (Throwable cause = e.getCause(); cause != null; cause = cause.getCause()) {
                if (cause instanceof sg.edu.nus.foc.reporting.error.ConflictException conflict) throw conflict;
                if (cause instanceof sg.edu.nus.foc.reporting.error.ForbiddenException forbidden) throw forbidden;
            }
            throw new DependencyUnavailableException("Report storage is unavailable.", e.getCause());
        }
    }
}
