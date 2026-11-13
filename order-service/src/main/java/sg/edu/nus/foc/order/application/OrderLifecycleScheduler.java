package sg.edu.nus.foc.order.application;

import java.time.Instant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.order.application.recovery.OrderCommandService;

/** Runs recovery before lifecycle checks without coupling their transactions or failures. */
@Component
@RequiredArgsConstructor
@Slf4j
public class OrderLifecycleScheduler {
    private final LifecycleProcessingService lifecycle;
    private final OrderCommandService commands;

    @org.springframework.beans.factory.annotation.Autowired
    private org.springframework.beans.factory.ObjectProvider<sg.edu.nus.foc.order.application.reportresolution.ReportResolutionService> reportResolutions;

    @Scheduled(cron = "${order.lifecycle.cron:0 * * * * *}")
    public void processDueOrders() {
        try {
            commands.recoverDue();
        } catch (RuntimeException exception) {
            log.error("Order command recovery pass failed; lifecycle checks will continue and the next pass will retry.",
                    exception);
        }

        try {
            if (reportResolutions != null) reportResolutions.ifAvailable(service -> service.recoverDue());
        } catch (RuntimeException exception) {
            log.error("Report resolution recovery failed; lifecycle checks will continue.", exception);
        }

        Instant now = Instant.now();
        try {
            int expired = lifecycle.expireDue(now);
            if (expired > 0) {
                log.info("Expired {} due OPEN orders and recorded their refund events.", expired);
            }
        } catch (RuntimeException exception) {
            log.error("Order expiry pass failed; the next lifecycle pass will retry.", exception);
        }
        try {
            int completed = lifecycle.autoCompleteDue(now);
            if (completed > 0) {
                log.info("Automatically completed {} DELIVERED orders after the 48-hour grace period.", completed);
            }
        } catch (RuntimeException exception) {
            log.error("Automatic order-completion pass failed; the next lifecycle pass will retry.", exception);
        }
        try {
            int reposted = lifecycle.repostDue(now, null);
            if (reposted > 0) log.info("Automatically reposted {} expired orders.", reposted);
        } catch (RuntimeException exception) {
            log.error("Automatic repost pass failed; the next lifecycle pass will retry.", exception);
        }
    }
}
