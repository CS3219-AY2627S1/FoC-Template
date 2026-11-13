package com.cs3219.foc.order.service;

import static com.cs3219.foc.order.model.entity.DisputeStatus.NEEDS_ATTENTION;
import static com.cs3219.foc.order.model.entity.DisputeStatus.PROCESSING;
import static com.cs3219.foc.order.model.entity.DisputeStatus.RESOLVED;
import static com.cs3219.foc.order.model.entity.ErrandStatus.*;

import com.cs3219.foc.order.exception.OrderConflictException;
import com.cs3219.foc.order.exception.OrderNotFoundException;
import com.cs3219.foc.order.model.dto.*;
import com.cs3219.foc.order.model.dto.event.*;
import com.cs3219.foc.order.model.entity.CreditState;
import com.cs3219.foc.order.model.entity.DisputeDecision;
import com.cs3219.foc.order.model.entity.DisputeStatus;
import com.cs3219.foc.order.model.entity.OrderDispute;
import com.cs3219.foc.order.repository.ErrandRepository;
import com.cs3219.foc.order.repository.OrderDisputeRepository;
import com.cs3219.foc.order.security.CurrentUserService;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class OrderDisputeService {
    private final ErrandRepository orders;
    private final OrderDisputeRepository disputes;
    private final CurrentUserService currentUser;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    @Transactional
    public OrderDisputeDto report(UUID orderId, ReportDisputeRequest request) {
        var actor = currentUser.requireCurrentUserId();
        var order = orders.findForUpdateById(orderId).orElseThrow(() -> new OrderNotFoundException(orderId));
        if (!actor.equals(order.getRequesterId()) && !actor.equals(order.getCourierId())) {
            throw new AccessDeniedException("Only order participants can report a dispute");
        }
        var existing = disputes.findByOrderId(orderId);
        if (existing.isPresent()) return OrderDisputeDto.from(existing.get());
        if (!Set.of(ACCEPTED, PICKED_UP, DELIVERED).contains(order.getStatus())
                || order.getCreditState() != CreditState.RESERVED) {
            throw new OrderConflictException(
                    "Only accepted, picked-up or delivered orders with reserved credits can be disputed");
        }
        var dispute = new OrderDispute();
        dispute.setId(UUID.randomUUID());
        dispute.setOrderId(orderId);
        dispute.setReporterId(actor);
        dispute.setComplaint(request.complaint().strip());
        dispute.setStatus(DisputeStatus.OPEN);
        dispute.setCreatedAt(now());
        return OrderDisputeDto.from(disputes.saveAndFlush(dispute));
    }

    @Transactional
    public OrderDisputeDto respond(UUID id, RespondToDisputeRequest request) {
        var actor = currentUser.requireCurrentUserId();
        var orderId = disputes.findOrderIdById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dispute not found"));
        var order = orders.findForUpdateById(orderId).orElseThrow(() -> new OrderNotFoundException(orderId));
        var dispute = disputes.findForUpdateByOrderId(orderId).orElseThrow();
        if (actor.equals(dispute.getReporterId())
                || (!actor.equals(order.getRequesterId()) && !actor.equals(order.getCourierId()))) {
            throw new AccessDeniedException("Only the other order participant can respond to this dispute");
        }
        var response = request.response().strip();
        if (dispute.getResponse() != null) {
            if (!dispute.getResponse().equals(response)) {
                throw new OrderConflictException("A response has already been recorded for this dispute");
            }
            return OrderDisputeDto.from(dispute);
        }
        if (dispute.getStatus() != DisputeStatus.OPEN) {
            throw new OrderConflictException("Responses can only be submitted while the dispute is open");
        }
        dispute.setResponderId(actor);
        dispute.setResponse(response);
        dispute.setRespondedAt(now());
        return OrderDisputeDto.from(disputes.saveAndFlush(dispute));
    }

    @Transactional(readOnly = true)
    public PageDto<OrderDisputeDto> list(Pageable pageable) {
        requireAdmin();
        if (pageable.isUnpaged() || pageable.getPageSize() < 1 || pageable.getPageSize() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Page size must be 1-100");
        }
        var page = disputes.findAll(PageRequest.of(
                pageable.getPageNumber(), pageable.getPageSize(), Sort.by(Sort.Direction.DESC, "createdAt", "id")));
        return new PageDto<>(
                page.getContent().stream().map(OrderDisputeDto::from).toList(),
                page.getTotalElements(),
                page.getNumber(),
                page.getSize());
    }

    @Transactional
    public OrderDisputeDto resolve(UUID id, ResolveDisputeRequest request) {
        var actor = requireAdmin();
        var orderId = disputes.findOrderIdById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dispute not found"));
        // Every operation locks the order before the case, including normal lifecycle actions.
        var order = orders.findForUpdateById(orderId).orElseThrow(() -> new OrderNotFoundException(orderId));
        var dispute = disputes.findForUpdateByOrderId(order.getId()).orElseThrow();
        if (actor.equals(order.getRequesterId()) || actor.equals(order.getCourierId())) {
            throw new AccessDeniedException("An admin cannot resolve their own order dispute");
        }
        if (dispute.getDecision() != null) {
            if (dispute.getDecision() != request.decision()
                    || !Objects.equals(
                            dispute.getExplanation(), request.explanation().strip())) {
                throw new OrderConflictException("A decision has already been recorded for this dispute");
            }
            return OrderDisputeDto.from(dispute);
        }
        if (!Set.of(ACCEPTED, PICKED_UP, DELIVERED).contains(order.getStatus())
                || order.getCreditState() != CreditState.RESERVED) {
            throw new OrderConflictException("The order is no longer eligible for dispute resolution");
        }
        if (request.decision() == DisputeDecision.PAY_COURIER
                && (!Set.of(PICKED_UP, DELIVERED).contains(order.getStatus()) || order.getCourierId() == null)) {
            throw new OrderConflictException("Payment requires a picked-up or delivered order and assigned courier");
        }
        var timestamp = now();
        dispute.setDecision(request.decision());
        dispute.setExplanation(request.explanation().strip());
        dispute.setAdminId(actor);
        dispute.setDecidedAt(timestamp);
        if (request.decision() == DisputeDecision.DISMISS) {
            dispute.setStatus(RESOLVED);
            dispute.setResolvedAt(timestamp);
        } else {
            var operationId = UUID.randomUUID();
            dispute.setStatus(PROCESSING);
            dispute.setSettlementOperationId(operationId);
            order.setSettlementEventId(operationId);
            order.setEndedAt(timestamp);
            order.setUpdatedAt(timestamp);
            if (request.decision() == DisputeDecision.PAY_COURIER) {
                order.setStatus(COMPLETED);
                order.setCreditState(CreditState.SETTLEMENT_PENDING);
            } else {
                order.setStatus(CANCELLED);
                order.setCreditState(CreditState.RELEASE_PENDING);
            }
            orders.saveAndFlush(order);
            if (order.getStatus() == COMPLETED) {
                events.publishEvent(new ErrandCompletedEvent(
                        operationId,
                        1,
                        timestamp,
                        new ErrandCompletedEvent.Payload(
                                order.getId(), order.getRequesterId(), order.getCreditReward(), order.getCourierId())));
            } else {
                events.publishEvent(new ErrandCancelledEvent(
                        operationId,
                        1,
                        timestamp,
                        new ErrandCancelledEvent.Payload(
                                order.getId(), order.getRequesterId(), order.getCreditReward())));
            }
        }
        return OrderDisputeDto.from(disputes.saveAndFlush(dispute));
    }

    @Transactional(readOnly = true)
    public OrderDisputeDto forOrder(UUID orderId) {
        return disputes.findByOrderId(orderId).map(OrderDisputeDto::from).orElse(null);
    }

    public void requireNoActiveDispute(UUID orderId) {
        if (disputes.existsByOrderIdAndStatusNot(orderId, RESOLVED)) {
            throw new OrderConflictException("This order is paused while its dispute is being resolved");
        }
    }

    // Called in OrderService's transaction after validating the existing settlement contract.
    public void confirmSettlement(UUID orderId, UUID operationId, String outcome) {
        disputes.findForUpdateByOrderId(orderId).ifPresent(dispute -> {
            if (!operationId.equals(dispute.getSettlementOperationId()) || dispute.getStatus() == RESOLVED) return;
            dispute.setSettlementOutcome(outcome);
            if (Set.of("PAID", "REFUNDED").contains(outcome)) {
                dispute.setStatus(RESOLVED);
                dispute.setResolvedAt(now());
            } else {
                dispute.setStatus(NEEDS_ATTENTION);
            }
            disputes.saveAndFlush(dispute);
        });
    }

    private UUID requireAdmin() {
        var actor = currentUser.requireCurrentUser();
        if (!actor.hasRole("ADMIN")) throw new AccessDeniedException("Admin access required");
        return actor.userId();
    }

    private OffsetDateTime now() {
        return OffsetDateTime.ofInstant(clock.instant().truncatedTo(ChronoUnit.MICROS), ZoneOffset.UTC);
    }
}
