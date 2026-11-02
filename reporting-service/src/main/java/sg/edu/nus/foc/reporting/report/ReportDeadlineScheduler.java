/* AI Assistance Disclosure: OpenAI Codex, 2026-10-29. Bounded database deadline reconciliation for real admin filters. */
package sg.edu.nus.foc.reporting.report;

import java.time.Clock;
import org.slf4j.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class ReportDeadlineScheduler {
    private static final Logger log=LoggerFactory.getLogger(ReportDeadlineScheduler.class);
    private final ReportRepository reports;
    private final Clock clock;
    public ReportDeadlineScheduler(ReportRepository reports,Clock clock) { this.reports=reports; this.clock=clock; }
    @Scheduled(cron="${REPORT_RESPONSE_RECOVERY_CRON:0 * * * * *}")
    public void reconcileDue() {
        try {
            for (String id : java.util.stream.Stream.concat(reports.unresolvedErrandIds().stream(), reports.dueResponseIds(clock.instant()).stream()).distinct().toList()) {
                try { reports.update(id,current->current.reconcile(clock.instant())); }
                catch(RuntimeException e) { log.warn("Report {} deadline reconciliation failed; other cases continue",id,e); }
            }
        } catch(RuntimeException e) { log.error("Report deadline scan failed",e); }
    }
}
