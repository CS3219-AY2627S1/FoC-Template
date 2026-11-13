package sg.edu.nus.foc.order.application.adminmock;

import java.time.Clock;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Service;
import sg.edu.nus.foc.order.config.ReportDemoCondition;
import sg.edu.nus.foc.order.api.dto.request.ReportDemoRequest;
import sg.edu.nus.foc.order.api.dto.request.ReportEvidence;
import sg.edu.nus.foc.order.api.dto.response.*;
import sg.edu.nus.foc.order.api.mapper.ReportDemoMapper;
import sg.edu.nus.foc.order.domain.OrderProblem;

/** Local UI prototype only. Never calls real Order commands, funds, scores or Report APIs. */
@Service
@Conditional(ReportDemoCondition.class)
public class ReportDemoService {
    private final ReportDemoOrderStore orders;
    private final ReportDemoMapper mapper;
    private final Clock clock;
    private final Map<String, ReportDemoResponse> reports = new LinkedHashMap<>();
    private final Set<String> seededUsers = new HashSet<>();

    @Autowired
    public ReportDemoService(ReportDemoOrderStore orders, ReportDemoMapper mapper) {
        this(orders, mapper, Clock.systemUTC());
    }
    public ReportDemoService(ReportDemoOrderStore orders, ReportDemoMapper mapper, Clock clock) {
        this.orders = orders; this.mapper = mapper; this.clock = clock;
    }

    public synchronized List<ReportDemoOrderResponse> eligible(String userId) {
        seed(userId);
        return orders.reportFixtures(userId).stream().filter(order -> userId.equals(order.getRequesterId())
                && "DELIVERED".equals(order.getStatus()) && !hasActive(order.getId())).toList();
    }

    public synchronized ReportDemoPageResponse<ReportDemoResponse> list(String userId, String mode, String status, int page) {
        return list(userId, mode, status, page, null, null);
    }

    public synchronized ReportDemoPageResponse<ReportDemoResponse> list(String userId, String mode, String status, int page,
            String orderId, String reportStatus) {
        String exactOrderId = orderId == null ? "" : orderId.strip();
        if (exactOrderId.length() > 128 || (reportStatus != null && !reportStatus.isBlank()
                && !List.of("AWAITING_COURIER_RESPONSE", "READY_FOR_REVIEW", "RESOLVED").contains(reportStatus))) {
            throw invalid("Choose a valid report status and Order ID.");
        }
        seed(userId);
        if (!List.of("submitted", "against", "admin").contains(mode) || page < 1) throw invalid("Invalid report query.");
        List<ReportDemoResponse> matches = reports.values().stream()
                .filter(report -> "admin".equals(mode) || ("submitted".equals(mode)
                        ? userId.equals(report.getRequesterId()) : userId.equals(report.getCourierId())))
                .filter(report -> status == null || status.isBlank() || ("OPEN".equals(status) ? !"RESOLVED".equals(report.getStatus()) : status.equals(report.getStatus())))
                .filter(report -> exactOrderId.isEmpty() || exactOrderId.equals(report.getOrder().getId()))
                .filter(report -> reportStatus == null || reportStatus.isBlank() || reportStatus.equals(report.getStatus()))
                .sorted(Comparator.comparing(ReportDemoResponse::getCreatedAt).reversed()).toList();
        int from = (int) Math.min((long) (page - 1) * 20, matches.size());
        return new ReportDemoPageResponse<>(matches.subList(from, Math.min(from + 20, matches.size())).stream()
                .map(report -> visibleSnapshot(report, userId, "admin".equals(mode))).toList(), page, 20, matches.size(), (matches.size() + 19) / 20);
    }

    public synchronized ReportDemoResponse detail(String id, String userId, boolean admin) {
        ReportDemoResponse report = required(id);
        if (!admin && !Objects.equals(userId, report.getRequesterId()) && !Objects.equals(userId, report.getCourierId())) {
            throw OrderProblem.forbidden("Only report participants can view this case.");
        }
        return visibleSnapshot(report, userId, admin);
    }

    public synchronized ReportDemoResponse create(ReportDemoRequest input) {
        seed(input.getUserId());
        ReportDemoOrderResponse order = orders.sampleOrder(input.getOrderId());
        if (!Objects.equals(order.getRequesterId(), input.getUserId())) throw OrderProblem.forbidden("Only the requester can report their own delivery.");
        if (!"DELIVERED".equals(order.getStatus()) || hasActive(order.getId())) throw OrderProblem.conflict("Only a delivered order without an active report can be reported.");
        if (!List.of("WRONG_LOCATION_DELIVERY", "ITEM_MISHANDLING_OR_DAMAGE").contains(Objects.toString(input.getViolationCategory(), ""))) throw invalid("Choose one delivered-item violation category.");
        String explanation = explanation(input.getExplanation());
        List<ReportEvidence> evidence = evidence(input.getAttachments());
        ReportDemoResponse report = new ReportDemoResponse();
        report.setId("demo-report-" + UUID.randomUUID()); report.setOrder(order);
        report.setRequesterId(order.getRequesterId()); report.setCourierId(order.getCourierId());
        report.setViolationCategory(input.getViolationCategory()); report.setRequesterExplanation(explanation);
        report.setRequesterAttachments(evidence); report.setCourierAttachments(List.of());
        report.setCreatedAt(clock.instant());
        report.setStatus("AWAITING_COURIER_RESPONSE");
        reports.put(report.getId(), report); orders.reportHold(order.getId(), true);
        return snapshot(report);
    }

    public synchronized ReportDemoResponse respond(String id, ReportDemoRequest input) {
        ReportDemoResponse report = required(id);
        if (!Objects.equals(input.getUserId(), report.getCourierId())) throw OrderProblem.forbidden("Only the reported courier can respond.");
        if ("RESOLVED".equals(report.getStatus()) || report.getCourierResponseSubmittedAt() != null) throw OrderProblem.conflict("The report is resolved or a response was already submitted.");
        String explanation = explanation(input.getExplanation());
        List<ReportEvidence> evidence = evidence(input.getAttachments());
        report.setCourierExplanation(explanation); report.setCourierAttachments(evidence);
        report.setCourierResponseSubmittedAt(clock.instant()); report.setStatus("READY_FOR_REVIEW");
        return snapshot(report);
    }

    public synchronized ReportDemoResponse resolve(String id, String adminId, String note) {
        ReportDemoResponse report = required(id);
        String reason = explanation(note);
        if (adminId == null || adminId.isBlank()) throw invalid("Administrator identity required.");
        if ("RESOLVED".equals(report.getStatus())) {
            if (!Objects.equals(report.getResolutionNote(), reason) || !Objects.equals(report.getResolvedBy(), adminId)) throw OrderProblem.conflict("A different resolution is already saved.");
            return snapshot(report);
        }
        report.setStatus("RESOLVED"); report.setResolvedAt(clock.instant());
        report.setResolvedBy(adminId); report.setResolutionNote(reason);
        orders.reportHold(report.getOrder().getId(), hasActive(report.getOrder().getId()));
        return snapshot(report);
    }

    private void seed(String userId) {
        List<ReportDemoOrderResponse> fixtures = orders.reportFixtures(userId);
        if (!seededUsers.add(userId)) return;
        for (int index = 1; index < 4; index++) {
            ReportDemoOrderResponse order = fixtures.get(index);
            ReportDemoResponse report = new ReportDemoResponse();
            report.setId("demo-case-" + order.getId()); report.setOrder(order);
            report.setRequesterId(order.getRequesterId()); report.setCourierId(order.getCourierId());
            report.setViolationCategory(index == 2 ? "WRONG_LOCATION_DELIVERY" : "ITEM_MISHANDLING_OR_DAMAGE");
            report.setRequesterExplanation(index == 2 ? "The parcel was left at the wrong building." : "The packaging was damaged and the item arrived broken.");
            report.setRequesterAttachments(List.of()); report.setCourierAttachments(List.of());
            report.setCreatedAt(clock.instant().minusSeconds(index == 3 ? 32400 : 3600));
            report.setStatus(index == 1 ? "READY_FOR_REVIEW" : "AWAITING_COURIER_RESPONSE");
            if (index == 1) {
                report.setCourierExplanation("The outer box was already damaged at collection; please review both accounts.");
                report.setCourierResponseSubmittedAt(report.getCreatedAt().plusSeconds(1800));
            }
            reports.put(report.getId(), report); orders.reportHold(order.getId(), true);
        }
    }
    private boolean hasActive(String orderId) {
        return reports.values().stream().anyMatch(report -> orderId.equals(report.getOrder().getId()) && !"RESOLVED".equals(report.getStatus()));
    }
    private ReportDemoResponse required(String id) {
        ReportDemoResponse report = reports.get(id);
        if (report == null) throw OrderProblem.notFound("Sample report not found.");
        return report;
    }
    private ReportDemoResponse visibleSnapshot(ReportDemoResponse report, String userId, boolean admin) {
        ReportDemoResponse copy = snapshot(report);
        if (!admin && !Objects.equals(userId, report.getRequesterId())) copy.setResolutionNote(null);
        return copy;
    }
    private ReportDemoResponse snapshot(ReportDemoResponse report) {
        ReportDemoResponse copy = mapper.copyReport(report);
        copy.setOrder(orders.sampleOrder(report.getOrder().getId()));
        return copy;
    }
    private static String explanation(String text) {
        if (text == null || text.isBlank() || text.strip().length() > 2000) throw invalid("An explanation of 1 through 2000 characters is required.");
        return text.strip();
    }
    private List<ReportEvidence> evidence(List<ReportEvidence> attachments) {
        if (attachments == null) return List.of();
        if (attachments.size() > 3) throw invalid("At most three evidence files are allowed.");
        for (ReportEvidence file : attachments) {
            if (file == null || file.getName() == null || file.getName().isBlank() || file.getName().length() > 200
                    || !List.of("image/png", "image/jpeg", "image/webp", "application/pdf").contains(Objects.toString(file.getContentType(), ""))
                    || file.getDataUrl() == null || file.getDataUrl().length() > 2800000
                    || !file.getDataUrl().startsWith("data:" + file.getContentType() + ";base64,")) throw invalid("Use PNG, JPEG, WebP or PDF evidence, at most 2 MiB per file.");
            try {
                byte[] decoded = Base64.getDecoder().decode(file.getDataUrl().substring(file.getDataUrl().indexOf(',') + 1));
                if (decoded.length == 0 || decoded.length > 2 * 1024 * 1024) throw invalid("Evidence is empty or too large.");
            } catch (IllegalArgumentException failure) { throw invalid("Evidence must be valid base64."); }
        }
        return attachments.stream().map(mapper::copyEvidence).toList();
    }
    private static OrderProblem invalid(String message) { return new OrderProblem("VALIDATION_ERROR", message); }
}
