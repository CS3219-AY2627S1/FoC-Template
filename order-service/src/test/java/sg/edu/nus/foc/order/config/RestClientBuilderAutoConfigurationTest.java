package sg.edu.nus.foc.order.config;

import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.restclient.autoconfigure.RestClientAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.web.client.RestClient;

class RestClientBuilderAutoConfigurationTest {
    @Test
    void autoConfigurationProvidesRestClientBuilder() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(RestClientAutoConfiguration.class))
                .run(context -> assertNotNull(context.getBean(RestClient.Builder.class)));
    }
}
