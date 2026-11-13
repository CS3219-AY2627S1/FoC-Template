package sg.edu.nus.foc.order.application;

import java.time.Instant;
import java.util.Optional;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCompletionHold;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.repository.OrderCompletionHoldRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;
import sg.edu.nus.foc.order.security.Role;
import sg.edu.nus.foc.order.security.VerifiedOrderCaller;

@Service
@RequiredArgsConstructor
public class OrderCompletionHoldService {

    private final OrderRepository orders;
    private final OrderCompletionHoldRepository holds;
    private final UserServicePort users;
    private final OrderAuditLogger audit;

    @Transactional
    public Order place(String orderId, String reportId, String requesterId, String authorization) {
        if (reportId == null || reportId.isBlank() || reportId.length() > 128
                || !reportId.equals(reportId.strip())) {
            throw new OrderProblem("VALIDATION_ERROR", "A report ID of 1 through 128 characters is required.");
        }
        String actor = users.verifyRequester(requesterId, authorization);
        Order order = orders.getForUpdate(orderId)
                .orElseThrow(() -> OrderProblem.notFound("Order not found."));

        Optional<OrderCompletionHold> previous = holds.findByReportId(reportId);
        if (previous.isPresent()) {
            previous.get().requireBinding(orderId, actor);
            return order;
        }

        order.placeCompletionHold(actor);
        holds.save(new OrderCompletionHold(reportId, orderId, actor, Instant.now()));
        Order saved = orders.save(order);
        audit.action("PLACE_COMPLETION_HOLD", orderId, actor, reportId, "accepted");
        return saved;
    }

    /** Requester default retained for existing Reporting clients. */
    @Transactional
    public Order placeActive(String orderId, String reportId, String requesterId,
                             boolean requireAssignedCourier, String authorization) {
        return placeActive(orderId, reportId, requesterId, requireAssignedCourier, authorization, "REQUESTER");
    }

    @Transactional
    public Order placeActive(String orderId, String reportId, String reporterId,
                             boolean requireAssignedCourier, String authorization, String reporterRole) {
        return placeActive(orderId,reportId,null,reporterId,requireAssignedCourier,authorization,reporterRole);
    }

    @Transactional
    public Order placeActive(String orderId,String reportId,String submissionId,String reporterId,
                             boolean requireAssignedCourier,String authorization,String reporterRole) {
        if (reportId == null || reportId.isBlank() || reportId.length() > 128 || !reportId.equals(reportId.strip())) {
            throw new OrderProblem("VALIDATION_ERROR", "A report ID of 1 through 128 characters is required.");
        }
        if (!"REQUESTER".equals(reporterRole) && !"COURIER".equals(reporterRole) && !"PARTICIPANT".equals(reporterRole)) {
            throw new OrderProblem("VALIDATION_ERROR", "Reporter role must be REQUESTER, COURIER or PARTICIPANT.");
        }
        boolean participant = "PARTICIPANT".equals(reporterRole);
        Order order;
        boolean courierReport;
        String actor;
        if (participant) {
            order = orders.getActiveParticipantReportHoldUpdate(orderId, reporterId)
                    .orElseThrow(() -> OrderProblem.notFound("Active order not found."));
            courierReport = reporterId.equals(order.getCourierId());
            actor = courierReport ? VerifiedOrderCaller.identityFor(Role.COURIER, reporterId)
                    .orElseGet(() -> users.verifyCourier(reporterId, authorization))
                    : users.verifyRequester(reporterId, authorization);
        } else {
            courierReport = "COURIER".equals(reporterRole);
            // Reporting an existing assignment requires identity/role, not eligibility for a new task.
            actor = courierReport ? VerifiedOrderCaller.identityFor(Role.COURIER, reporterId)
                    .orElseGet(() -> users.verifyCourier(reporterId, authorization))
                    : users.verifyRequester(reporterId, authorization);
            order = (courierReport ? orders.getActiveCourierReportHoldUpdate(orderId, actor)
                    : orders.getActiveForReportHoldUpdate(orderId, actor))
                    .orElseThrow(() -> OrderProblem.notFound("Active order not found."));
        }
        boolean newCreationLifecycle=false;
        if(submissionId!=null){
            if(creationLifecycle==null)throw new IllegalStateException("Report creation lifecycle is unavailable.");
            newCreationLifecycle=creationLifecycle.registerPlacement(reportId,submissionId,orderId,reporterId);
        }
        Optional<OrderCompletionHold> previous = holds.findByReportId(reportId);
        if (previous.isPresent()) {
            if(newCreationLifecycle)throw OrderProblem.conflict("Report ID is already bound to another hold lifecycle.");
            previous.get().requireBinding(orderId, order.getRequesterId());
            if (previous.get().getReleasedAt() != null) throw OrderProblem.conflict("This report hold has already been released.");
        }
        if (requireAssignedCourier && order.getCourierId() == null) {
            throw OrderProblem.conflict("A courier must be assigned for this report.");
        }
        if (previous.isPresent()) return order;
        if (holds.hasActiveForOrder(orderId)) {
            throw OrderProblem.conflict("This order has an active report. Please resolve it before proceeding.");
        }
        if (courierReport) order.placeCourierReportHold(actor);
        else order.placeCompletionHold(actor);
        holds.save(new OrderCompletionHold(reportId, orderId, order.getRequesterId(), Instant.now()));
        if(submissionId!=null)creationLifecycle.holdCreated(reportId);
        Order saved = orders.save(order);
        audit.action("PLACE_COMPLETION_HOLD", orderId, actor, reportId, "accepted");
        return saved;
    }

    private sg.edu.nus.foc.order.application.reportresolution.ReportResolutionReleaseGuard resolutionGuard;
    private sg.edu.nus.foc.order.application.reportcreation.ReportCreationLifecycle creationLifecycle;

    @org.springframework.beans.factory.annotation.Autowired
    public void setResolutionGuard(sg.edu.nus.foc.order.application.reportresolution.ReportResolutionReleaseGuard guard) { this.resolutionGuard = guard; }
    @org.springframework.beans.factory.annotation.Autowired
    public void setCreationLifecycle(sg.edu.nus.foc.order.application.reportcreation.ReportCreationLifecycle lifecycle){this.creationLifecycle=lifecycle;}

    @Transactional
    public Order release(String orderId, String reportId, String adminId) {
        return releaseInternal(orderId, reportId, adminId, null, null);
    }

    @Transactional
    public Order releaseForReportResolution(String orderId, String reportId, String adminId, String commandId, String owner) {
        return releaseInternal(orderId, reportId, adminId, commandId, owner);
    }

    @Transactional
    public Order releaseForCreationCompensation(String orderId,String reportId,String submissionId){
        return releaseInternal(orderId,reportId,"creation:"+submissionId,null,null,true);
    }

    private Order releaseInternal(String orderId, String reportId, String adminId, String commandId, String owner) {
        return releaseInternal(orderId,reportId,adminId,commandId,owner,false);
    }
    private Order releaseInternal(String orderId,String reportId,String adminId,String commandId,String owner,boolean creationCompensation){
        Order order = orders.getForLifecycleUpdate(orderId)
                .orElseThrow(() -> OrderProblem.notFound("Order not found."));
        OrderCompletionHold hold = holds.findByReportId(reportId)
                .orElseThrow(() -> OrderProblem.notFound("Report hold not found."));
        if (!orderId.equals(hold.getOrderId())) {
            throw OrderProblem.conflict("Report hold belongs to a different order.");
        }
        if (resolutionGuard != null && !creationCompensation) {
            if (commandId == null) resolutionGuard.manual(reportId);
            else resolutionGuard.coordinated(reportId, commandId, owner);
        }
        if (hold.getReleasedAt() != null) return order;
        hold.release(adminId, Instant.now());
        holds.release(hold);
        order.reconcileReportHolds(holds.hasActiveForOrder(orderId));
        Order saved = orders.save(order);
        audit.action("RELEASE_COMPLETION_HOLD", orderId, adminId, reportId, "accepted");
        return saved;
    }
}
