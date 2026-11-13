package sg.edu.nus.foc.order.application.reportresolution;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.order.domain.OrderProblem;

/** Remains active when transport is disabled, so pending durable work cannot be bypassed. */
@Component
@RequiredArgsConstructor
public class ReportResolutionReleaseGuard {
    private final JdbcTemplate jdbc;
    public void manual(String reportId) {
        if (Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from order_report_resolutions where report_id=?
                  and state in ('PENDING','COMPENSATING','RECONCILIATION_REQUIRED'))
                """, Boolean.class, reportId))) {
            throw OrderProblem.conflict("This report has an unresolved resolution request.");
        }
    }
    public void coordinated(String reportId, String commandId, String owner) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from order_report_resolutions where report_id=? and command_id=? and owner=?
                  and state='PENDING' and generation=1 and compensation_id is null and lease_until>clock_timestamp())
                """, Boolean.class, reportId, commandId, owner))) {
            throw OrderProblem.conflict("The report resolution no longer owns this hold release.");
        }
    }
}
