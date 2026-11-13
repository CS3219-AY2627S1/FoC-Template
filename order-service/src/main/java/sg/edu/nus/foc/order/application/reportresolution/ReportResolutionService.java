package sg.edu.nus.foc.order.application.reportresolution;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import sg.edu.nus.foc.order.api.dto.response.ReportResolutionResponse;
import sg.edu.nus.foc.order.domain.OrderProblem;

/** Suspend any caller transaction: intent, remote effect and final local commit have separate boundaries. */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@ConditionalOnProperty(name = "order.reports.resolution.enabled", havingValue = "true")
public class ReportResolutionService {
    private final ReportResolutionJournal journal;
    private final ReportResolutionGateway report;
    public ReportResolutionResponse resolve(String key, String orderId, String reportId, String adminId, String reply, String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, "Bearer ", 0, 7)
                || authorization.substring(7).isBlank())
            throw new OrderProblem("UNAUTHENTICATED", "The resolving administrator's Firebase token is required.");
        var start = journal.begin(key, orderId, reportId, adminId, reply);
        if (start.execute()) {
            try {
                journal.possibleEffect(start);
                var result = report.resolve(start.command(), authorization);
                journal.confirm(start, result);
                if ("APPLIED".equals(result.outcome())) journal.complete(start);
            } catch (RuntimeException failure) {
                // Rereads durable state. A committed success is never compensated after a lost response.
                journal.abandon(start);
                log.warn("Report resolution {} entered recovery after a remote/local uncertainty.", key);
            }
        }
        return journal.get(key);
    }
    public ReportResolutionResponse status(String key) { return journal.get(key); }
    public void recoverDue() {
        for (String key : journal.due(20)) {
            try { journal.recover(key); }
            catch (RuntimeException failure) { log.warn("Report resolution {} recovery failed; other jobs continue.", key); }
        }
    }
}
