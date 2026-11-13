/* AI Assistance Disclosure: OpenAI Codex, 2026-10-29. Deadline failure isolation regression. */
package sg.edu.nus.foc.reporting.report;

import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class ReportDeadlineSchedulerTest {
    @Test void failingCaseAndScanDoNotStopLaterCasesOrEscapeScheduler() {
        var repo=mock(ReportRepository.class);var clock=Clock.fixed(Instant.parse("2026-10-29T00:00:00Z"),ZoneOffset.UTC);
        when(repo.dueResponseIds(clock.instant())).thenReturn(List.of("bad","good"));
        when(repo.update(eq("bad"),any())).thenThrow(new IllegalStateException("temporary storage failure"));
        var scheduler=new ReportDeadlineScheduler(repo,clock);
        assertDoesNotThrow(scheduler::reconcileDue);verify(repo).update(eq("good"),any());
        when(repo.dueResponseIds(clock.instant())).thenThrow(new IllegalStateException("scan failure"));
        assertDoesNotThrow(scheduler::reconcileDue);
    }
}
