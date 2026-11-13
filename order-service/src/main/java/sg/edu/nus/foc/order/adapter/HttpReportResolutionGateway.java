package sg.edu.nus.foc.order.adapter;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import sg.edu.nus.foc.order.application.reportresolution.ReportResolutionGateway;
import sg.edu.nus.foc.order.application.reportresolution.ReportResolutionMessages;
import sg.edu.nus.foc.order.config.ReportResolutionSettings;

@Component
@ConditionalOnProperty(name = "order.reports.resolution.enabled", havingValue = "true")
public class HttpReportResolutionGateway implements ReportResolutionGateway {
    private final RestClient client;
    public HttpReportResolutionGateway(ReportResolutionSettings settings) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(settings.timeout()); factory.setReadTimeout(settings.timeout());
        client = RestClient.builder().baseUrl(settings.baseUrl()).requestFactory(factory).build();
    }
    @Override public ReportResolutionMessages.Resolution resolve(ReportResolutionMessages.Command command, String authorization) {
        return client.put().uri("/api/reports/internal/order-resolutions/{commandId}", command.commandId())
                .header(HttpHeaders.AUTHORIZATION, authorization).body(command).retrieve()
                .body(ReportResolutionMessages.Resolution.class);
    }
}
