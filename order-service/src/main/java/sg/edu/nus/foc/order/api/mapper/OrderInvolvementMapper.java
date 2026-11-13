package sg.edu.nus.foc.order.api.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingConstants;
import org.mapstruct.ReportingPolicy;

import sg.edu.nus.foc.order.api.dto.response.SupplierActiveOrderInvolvementResponse;
import sg.edu.nus.foc.order.api.dto.response.UserActiveOrderInvolvementResponse;
import sg.edu.nus.foc.order.domain.ActiveOrderInvolvement;

@Mapper(componentModel = MappingConstants.ComponentModel.SPRING, unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface OrderInvolvementMapper {

    @Mapping(target = "userId", source = "subjectId")
    @Mapping(target = "hasActiveOrders", source = "hasActiveOrders")
    UserActiveOrderInvolvementResponse toUserResponse(ActiveOrderInvolvement involvement);

    @Mapping(target = "supplierId", source = "subjectId")
    @Mapping(target = "hasActiveOrders", source = "hasActiveOrders")
    SupplierActiveOrderInvolvementResponse toSupplierResponse(ActiveOrderInvolvement involvement);
}
