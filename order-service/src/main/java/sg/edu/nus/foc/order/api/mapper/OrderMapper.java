package sg.edu.nus.foc.order.api.mapper;


import org.mapstruct.BeanMapping;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingConstants;
import org.mapstruct.ReportingPolicy;
import java.util.List;
import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
import sg.edu.nus.foc.order.api.dto.response.PenaltyPolicyResponse;

import sg.edu.nus.foc.order.api.dto.response.OrderPageResponse;
import sg.edu.nus.foc.order.api.dto.response.CompletionHoldResponse;
import sg.edu.nus.foc.order.api.dto.response.OrderResponse;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.repository.OrderPage;

@Mapper(
        componentModel = MappingConstants.ComponentModel.SPRING,
        unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface OrderMapper {

    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "overdue", source = "overdue")
    @Mapping(target = "overduePenaltyWaived", source = "overduePenaltyWaived")
    @Mapping(target = "overdueWaivedAt", source = "overdueWaivedAt")
    @Mapping(target = "overdueWaivedBy", source = "overdueWaivedBy")
    @Mapping(target = "overdueWaiverReason", source = "overdueWaiverReason")
    @Mapping(target = "appliedPenalty", source = "appliedPenalty")
    @Mapping(target = "appliedPenaltyAmount", source = "appliedPenaltyAmount")
    @Mapping(target = "appliedPenaltyAt", source = "appliedPenaltyAt")
    @Mapping(target = "appliedPenaltyBy", source = "appliedPenaltyBy")
    @Mapping(target = "appliedPenaltyReason", source = "appliedPenaltyReason")
    @Mapping(target = "adminPenaltyDecision", source = "adminPenaltyDecision")
    @Mapping(target = "adminPenaltyReason", source = "adminPenaltyReason")
    @Mapping(target = "adminPenaltyAmount", source = "adminPenaltyAmount")
    @Mapping(target = "adminResolutionAt", source = "adminResolutionAt")
    @Mapping(target = "adminResolutionReason", source = "adminResolutionReason")
    @Mapping(target = "deliveryDeadlineAt", source = "deliveryDeadlineAt")
    @Mapping(target = "startedAt", expression = "java(order.getDeliveryDeadlineAt() == null ? null : order.getDeliveryDeadlineAt().minusSeconds(order.getDeliveryTimeLimitMinutes() * 60L))")
    @Mapping(target = "deliveredAt", source = "deliveredAt")
    @Mapping(target = "id", source = "id")
    @Mapping(target = "attemptId", source = "attemptId")
    @Mapping(target = "requesterId", source = "requesterId")
    @Mapping(target = "courierId", source = "courierId")
    @Mapping(target = "itemDescription", source = "itemDescription")
    @Mapping(target = "pickupSupplierId", source = "pickupSupplierId")
    @Mapping(target = "deliverySupplierId", source = "deliverySupplierId")
    @Mapping(target = "offeredCredits", source = "offeredCredits")
    @Mapping(target = "status", source = "status")
    @Mapping(target = "completionHold", source = "completionHold")
    @Mapping(target = "createdAt", source = "createdAt")
    @Mapping(target = "expiresAt", source = "expiresAt")
    @Mapping(target = "deliveryTimeLimitMinutes", source = "deliveryTimeLimitMinutes")
    @Mapping(target = "version", source = "version")
    @Mapping(target = "originalOrderId", source = "originalOrderId")
    @Mapping(target = "repostedOrderId", source = "repostedOrderId")
    @Mapping(
            target = "automaticRepostEnabled",
            source = "repostPlan.enabled",
            defaultValue = "false")
    @Mapping(target = "repostDueAt", source = "repostPlan.dueAt")
    @Mapping(target = "repostExpiresAt", source = "repostPlan.expiresAt")
    @Mapping(target = "repostFailureCode", source = "repostFailureCode")
    @Mapping(target = "repostFailureMessage", source = "repostFailureMessage")
    @Mapping(target = "repostFailureAt", source = "repostFailureAt")
    @Mapping(
            target = "repostCreditAmount",
            source = "repostPlan.creditAmount",
            defaultValue = "0")
    @Mapping(
            target = "repostDeliveryDurationMinutes",
            source = "repostPlan.deliveryDurationMinutes",
            defaultValue = "0")
    OrderResponse toResponse(Order order);

    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "policy", source = "policy")
    @Mapping(target = "penaltyAmount", source = "policy.penaltyAmount")
    PenaltyPolicyResponse toPenaltyPolicy(PenaltySystemPolicy policy);

    List<PenaltyPolicyResponse> toPenaltyPolicies(List<PenaltySystemPolicy> policies);

    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "orderId", source = "order.id")
    @Mapping(target = "reportId", source = "reportId")
    @Mapping(target = "completionHold", source = "order.completionHold")
    @Mapping(target = "version", source = "order.version")
    CompletionHoldResponse toHoldResponse(Order order, String reportId);

    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "id", source = "order.id")
    @Mapping(target = "requesterId", source = "order.requesterId")
    @Mapping(target = "courierId", source = "order.courierId")
    @Mapping(target = "status", source = "order.status")
    @Mapping(target = "reportId", source = "reportId")
    @Mapping(target = "isCompletionHold", source = "order.completionHold")
    sg.edu.nus.foc.order.api.dto.response.ActiveReportHoldResponse toActiveHoldResponse(Order order, String reportId);

    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "items", source = "items")
    @Mapping(target = "page", expression = "java(orderPage.getPage() + 1)")
    @Mapping(target = "size", source = "size")
    @Mapping(target = "totalItems", source = "totalItems")
    @Mapping(target = "totalPages", source = "totalPages")
    OrderPageResponse toResponse(OrderPage orderPage);
}
