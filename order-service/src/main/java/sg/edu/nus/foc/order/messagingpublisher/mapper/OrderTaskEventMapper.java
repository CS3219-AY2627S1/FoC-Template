package sg.edu.nus.foc.order.messagingpublisher.mapper;

import java.time.Instant;
import org.mapstruct.BeanMapping;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingConstants;
import org.mapstruct.ReportingPolicy;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.messagingpublisher.dto.CourierPenaltyEventFacts;
import sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreAdditionEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreDeductionEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderCompletionTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.OpenOrderRefundTaskEvent;

@Mapper(
        componentModel = MappingConstants.ComponentModel.SPRING,
        unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface OrderTaskEventMapper {

    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "eventId", source = "eventId")
    @Mapping(target = "eventType", constant = "PenaltyScoreAdditionEvent")
    @Mapping(target = "eventVersion", constant = "2")
    @Mapping(target = "orderId", source = "orderId")
    @Mapping(target = "orderVersion", source = "orderVersion")
    @Mapping(target = "courierId", source = "courierId")
    @Mapping(target = "penaltyAmount", source = "penaltyAmount")
    @Mapping(target = "occurredAt", source = "occurredAt")
    @Mapping(target = "appliedReason", source = "appliedReason")
    @Mapping(target = "courierSequence", source = "courierSequence")
    PenaltyScoreAdditionEvent toPenaltyAdditionEvent(CourierPenaltyEventFacts facts);

    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "eventId", source = "eventId")
    @Mapping(target = "eventType", constant = "PenaltyScoreDeductionEvent")
    @Mapping(target = "eventVersion", constant = "2")
    @Mapping(target = "orderId", source = "orderId")
    @Mapping(target = "orderVersion", source = "orderVersion")
    @Mapping(target = "courierId", source = "courierId")
    @Mapping(target = "penaltyAmount", source = "penaltyAmount")
    @Mapping(target = "occurredAt", source = "occurredAt")
    @Mapping(target = "appliedReason", source = "appliedReason")
    @Mapping(target = "courierSequence", source = "courierSequence")
    PenaltyScoreDeductionEvent toPenaltyDeductionEvent(CourierPenaltyEventFacts facts);

    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "eventId", source = "eventId")
    @Mapping(target = "eventType", constant = "OrderCompletionTaskEvent")
    @Mapping(target = "eventVersion", constant = "2")
    @Mapping(target = "orderId", source = "order.id")
    @Mapping(target = "orderVersion", source = "resultingVersion")
    @Mapping(target = "orderStatus", source = "order.status")
    @Mapping(target = "creditAmount", source = "order.offeredCredits")
    @Mapping(target = "courierId", source = "order.courierId")
    @Mapping(target = "occurredAt", source = "occurredAt")
    OrderCompletionTaskEvent toCompletionEvent(
            String eventId, Order order, long resultingVersion, Instant occurredAt);

    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "eventId", source = "eventId")
    @Mapping(target = "eventType", constant = "OpenOrderRefundTaskEvent")
    @Mapping(target = "eventVersion", constant = "2")
    @Mapping(target = "orderId", source = "order.id")
    @Mapping(target = "orderVersion", source = "resultingVersion")
    @Mapping(target = "orderStatus", source = "order.status")
    @Mapping(target = "creditAmount", source = "order.offeredCredits")
    @Mapping(target = "courierId", source = "order.courierId")
    @Mapping(target = "occurredAt", source = "occurredAt")
    OpenOrderRefundTaskEvent toOpenRefundEvent(
            String eventId, Order order, long resultingVersion, Instant occurredAt);

}
