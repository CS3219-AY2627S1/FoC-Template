/* AI Assistance Disclosure: OpenAI Codex, 2026-10-29. Atomic Report resolution, fencing and durable compensation results; review pending. */
package sg.edu.nus.foc.reporting.report;

import com.google.cloud.firestore.*;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.*;
import java.util.concurrent.ExecutionException;
import org.springframework.stereotype.Service;
import sg.edu.nus.foc.reporting.error.*;
import sg.edu.nus.foc.reporting.resolution.ResolutionMessages.*;
import tools.jackson.databind.json.JsonMapper;

/** Every decision, preimage, fence and result outbox is committed with its Report mutation. */
@Service
public class ReportResolutionStore {
    public static final String OPERATIONS = "report_order_resolutions";
    public static final String RESULTS = "report_resolution_results";
    private final Firestore db;
    private final JsonMapper json;
    private final Clock clock;

    public ReportResolutionStore(Firestore db, JsonMapper json, Clock clock) {
        this.db = db; this.json = json; this.clock = clock;
    }

    public Resolution resolve(Command c) {
        return transaction(tx -> {
            var ref = db.collection(OPERATIONS).document(key(c.commandId()));
            var operation = tx.get(ref).get();
            String binding = binding(c.commandId(), c.reportId(), c.orderId(), c.requesterId(), c.courierId(), c.adminId());
            if (operation.exists()) {
                requireBinding(operation, binding);
                if (Boolean.TRUE.equals(operation.getBoolean("fenced"))) return decision(c, "NO_EFFECT", "FENCED");
                if (!Objects.equals(operation.getString("reply"), c.reply())) throw new ConflictException("Command ID already has a different reply.");
                return json.readValue(operation.getString("decision"), Resolution.class);
            }
            var reportRef = reportRef(c.reportId());
            var snapshot = tx.get(reportRef).get();
            String code = !snapshot.exists() ? "REPORT_NOT_FOUND"
                    : !matches(snapshot, c.orderId(), c.requesterId(), c.courierId()) ? "BINDING_MISMATCH"
                    : "RESOLVED".equals(snapshot.getString("status")) ? "ALREADY_RESOLVED" : "RESOLVED";
            boolean apply = code.equals("RESOLVED");
            var result = decision(c, apply ? "APPLIED" : "NO_EFFECT", code);
            var journal = new HashMap<String,Object>();
            journal.put("binding", binding); journal.put("reply", c.reply());
            journal.put("decision", json.writeValueAsString(result));
            journal.put("fenced", false); journal.put("applied", apply);
            if (apply) {
                Report current = FirestoreReportRepository.fromDocument(snapshot).reconcile(clock.instant());
                var preimage = new HashMap<String, Object>(snapshot.getData());
                preimage.putAll(FirestoreReportRepository.toDocument(current));
                journal.put("preimage", preimage);
                long revision = revision(snapshot) + 1;
                journal.put("resultingRevision", revision);
                var report = current.resolved(clock.instant());
                var document = FirestoreReportRepository.toDocument(report);
                document.put("resolutionNote", c.reply()); document.put("resolvedBy", c.adminId());
                document.put("revision", revision);
                tx.set(reportRef, document);
            }
            tx.set(ref, journal);
            return result;
        });
    }

    public Result compensate(Compensation c) {
        return transaction(tx -> {
            var opRef = db.collection(OPERATIONS).document(key(c.commandId()));
            var resultRef = db.collection(RESULTS).document(c.eventId());
            var op = tx.get(opRef).get();
            var oldResult = tx.get(resultRef).get();
            String request = json.writeValueAsString(c);
            String binding = binding(c.commandId(), c.reportId(), c.orderId(), c.requesterId(), c.courierId(), c.adminId());
            if (oldResult.exists()) {
                if (!request.equals(oldResult.getString("request"))) throw new ConflictException("Compensation event ID reused with different content.");
                // A duplicate rearms the SAME result; it never repeats the Report mutation.
                if (Set.of("PUBLISHED", "FAILED").contains(oldResult.getString("state")))
                    tx.update(resultRef, Map.of("state", "PENDING", "nextAttemptAt", clock.millis(), "attempts", 0L));
                return json.readValue(oldResult.getString("payload"), Result.class);
            }
            if (op.exists()) {
                requireBinding(op, binding);
                if (op.contains("compensationId")) throw new ConflictException("Command already has a compensation event.");
            }
            var reportRef = reportRef(c.reportId());
            var report = tx.get(reportRef).get();
            boolean applied = op.exists() && Boolean.TRUE.equals(op.getBoolean("applied"));
            boolean reversible = applied && report.exists()
                    && revision(report) == op.getLong("resultingRevision");
            String outcome = applied && !reversible ? "RECONCILIATION_REQUIRED" : "COMPENSATED";
            String code = reversible ? "REVERSED" : applied ? "NEWER_REPORT_REVISION" : "FENCED_NO_EFFECT";
            var result = new Result(UUID.nameUUIDFromBytes(("ReportResolutionCompensationResult:" + c.eventId())
                    .getBytes(StandardCharsets.UTF_8)).toString(), c.eventId(), c.commandId(), c.reportId(),
                    c.orderId(), c.requesterId(), c.courierId(), c.adminId(), 2, outcome, code);
            if (reversible) {
                @SuppressWarnings("unchecked") var prior = new HashMap<>((Map<String,Object>)op.get("preimage"));
                // Keep the original deadline; reconcile expiry without overwriting later courier/admin work.
                var deadline = (com.google.cloud.Timestamp)prior.get("responseDeadlineAt");
                if ("AWAITING_COURIER_RESPONSE".equals(prior.get("status")) && deadline != null
                        && !clock.instant().isBefore(deadline.toDate().toInstant())) prior.put("status", "READY_FOR_REVIEW");
                prior.put("revision", revision(report) + 1);
                tx.set(reportRef, prior);
            }
            var fence = op.exists() ? new HashMap<>(op.getData()) : new HashMap<String,Object>();
            fence.put("binding", binding); fence.put("fenced", true); fence.put("compensationId", c.eventId());
            tx.set(opRef, fence);
            var outbox = new HashMap<String,Object>();
            outbox.put("request", request); outbox.put("payload", json.writeValueAsString(result));
            outbox.put("state", "PENDING"); outbox.put("nextAttemptAt", clock.millis()); outbox.put("attempts", 0L);
            tx.set(resultRef, outbox);
            return result;
        });
    }

    public List<String> due() {
        try {
            return db.collection(RESULTS).whereLessThanOrEqualTo("nextAttemptAt", clock.millis()).limit(20)
                    .get().get().getDocuments().stream().map(DocumentSnapshot::getId).toList();
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw unavailable(e); }
        catch (ExecutionException e) { throw unavailable(e.getCause()); }
    }
    public record Claim(String id, String owner, String payload, long attempt) { }
    public Optional<Claim> claim(String id) {
        return transaction(tx -> {
            var ref = db.collection(RESULTS).document(id); var row = tx.get(ref).get();
            if (!row.exists() || row.getLong("nextAttemptAt") > clock.millis()) return Optional.empty();
            String owner = UUID.randomUUID().toString(); long attempt = row.getLong("attempts") + 1;
            tx.update(ref, Map.of("owner", owner, "state", "PUBLISHING", "nextAttemptAt", clock.millis()+120_000, "attempts", attempt));
            return Optional.of(new Claim(id, owner, row.getString("payload"), attempt));
        });
    }
    public void finish(Claim claim, boolean published) {
        transaction(tx -> {
            var ref = db.collection(RESULTS).document(claim.id()); var row = tx.get(ref).get();
            if (claim.owner().equals(row.getString("owner"))) {
                String state = published ? "PUBLISHED" : claim.attempt() >= 10 ? "FAILED" : "PENDING";
                tx.update(ref, Map.of("state", state, "nextAttemptAt", state.equals("PENDING")
                        ? clock.millis() + Math.min(300_000, 1000L << Math.min(8, claim.attempt())) : Long.MAX_VALUE));
            }
            return null;
        });
    }
    private DocumentReference reportRef(String id) {
        if (!FirestoreReportRepository.validId(id)) throw new BadRequestException("Invalid report ID.", "reportId");
        return db.collection("reports").document(id);
    }
    private static boolean matches(DocumentSnapshot r, String order, String requester, String courier) {
        String actualRequester = r.getString("requesterId");
        if (actualRequester == null && !"ERRAND".equals(r.getString("category"))) actualRequester = r.getString("reporterId");
        return Objects.equals(order, r.getString("orderId")) && Objects.equals(requester, actualRequester)
                && Objects.equals(courier, r.getString("courierId"));
    }
    private static void requireBinding(DocumentSnapshot operation, String binding) {
        if (!binding.equals(operation.getString("binding"))) throw new ConflictException("Resolution command binding conflicts.");
    }
    private String binding(String command, String report, String order, String requester, String courier, String admin) {
        return json.writeValueAsString(Arrays.asList(command, report, order, requester, courier, admin));
    }
    private static Resolution decision(Command c, String outcome, String code) {
        return new Resolution(c.commandId(), c.reportId(), c.orderId(), c.requesterId(), c.courierId(), c.adminId(), 1, outcome, code);
    }
    private static long revision(DocumentSnapshot row) { return row.contains("revision") ? row.getLong("revision") : 0; }
    private static String key(String command) { return Base64.getUrlEncoder().withoutPadding().encodeToString(command.getBytes(StandardCharsets.UTF_8)); }
    private <T> T transaction(Transaction.Function<T> work) {
        try { return db.runTransaction(work).get(); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw unavailable(e); }
        catch (ExecutionException e) {
            Throwable cause = e.getCause();
            while (cause != null) {
                if (cause instanceof ConflictException conflict) throw conflict;
                if (cause instanceof BadRequestException bad) throw bad;
                cause = cause.getCause();
            }
            throw unavailable(e.getCause());
        }
    }
    private static DependencyUnavailableException unavailable(Throwable e) { return new DependencyUnavailableException("Report resolution storage is unavailable.", e); }
}
