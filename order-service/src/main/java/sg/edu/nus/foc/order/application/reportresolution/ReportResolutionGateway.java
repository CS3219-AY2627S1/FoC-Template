package sg.edu.nus.foc.order.application.reportresolution;

/** Report Service is absent: this is the explicit callback-free contract-stub boundary. */
public interface ReportResolutionGateway {
    ReportResolutionMessages.Resolution resolve(ReportResolutionMessages.Command command, String authorization);
}
