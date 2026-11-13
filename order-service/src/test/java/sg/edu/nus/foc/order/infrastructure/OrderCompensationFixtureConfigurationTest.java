package sg.edu.nus.foc.order.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import sg.edu.nus.foc.order.messagingpublisher.publisher.GoogleCloudPubSubPublisherFactory;

/** Validate the real integration fixture settings without requiring PostgreSQL or credentials. */
class OrderCompensationFixtureConfigurationTest {

    private ApplicationContextRunner fixtureContext() {
        String[] properties = OrderCompensationPostgresIntegrationTest.class
                .getAnnotation(SpringBootTest.class).properties();
        return new ApplicationContextRunner()
                .withUserConfiguration(GoogleCloudPubSubPublisherFactory.class)
                .withPropertyValues(properties);
    }

    @Test
    void compensationFixtureUsesASupportedMessagingMode() {
        fixtureContext().run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(GoogleCloudPubSubPublisherFactory.class);
        });
    }

    @Test
    void unsupportedMockModeRemainsRejectedInsteadOfWeakeningProductionValidation() {
        fixtureContext().withPropertyValues("order.messaging.mode=mock")
                .run(context -> assertThat(context).hasFailed()
                        .getFailure().hasRootCauseInstanceOf(IllegalArgumentException.class)
                        .hasStackTraceContaining("Order messaging mode must be cloud or emulator."));
    }
}
