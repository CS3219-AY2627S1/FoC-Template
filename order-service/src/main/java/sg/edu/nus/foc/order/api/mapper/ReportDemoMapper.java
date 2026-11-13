package sg.edu.nus.foc.order.api.mapper;

import org.mapstruct.Mapper;
import sg.edu.nus.foc.order.api.dto.request.ReportEvidence;
import sg.edu.nus.foc.order.api.dto.response.ReportDemoOrderResponse;
import sg.edu.nus.foc.order.api.dto.response.ReportDemoResponse;

/** Copies prevent callers mutating the local Report fixture store. */
@Mapper(componentModel = "spring")
public interface ReportDemoMapper {
    ReportDemoResponse copyReport(ReportDemoResponse source);
    ReportEvidence copyEvidence(ReportEvidence source);
    ReportDemoOrderResponse copyOrder(ReportDemoOrderResponse source);
}
