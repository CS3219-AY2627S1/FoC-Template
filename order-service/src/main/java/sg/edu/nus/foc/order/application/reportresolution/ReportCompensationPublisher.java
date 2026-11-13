package sg.edu.nus.foc.order.application.reportresolution;

public interface ReportCompensationPublisher {
    void publish(ReportResolutionMessages.Compensation compensation);
}
