package com.campuscouriers.credit.config;

import com.campuscouriers.credit.event.ErrandExpiredEvent;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.apache.kafka.common.serialization.Deserializer;
import org.apache.kafka.common.errors.SerializationException;
import tools.jackson.databind.json.JsonMapper;

import java.util.HashMap;
import java.util.Map;

@Configuration
public class KafkaConsumerConfig {

    @Bean
    public ConsumerFactory<String, ErrandExpiredEvent> errandExpiredConsumerFactory(
            @Value("${spring.kafka.bootstrap-servers}") String bootstrapServers) {
        Map<String, Object> properties = new HashMap<>();
        properties.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        properties.put(ConsumerConfig.GROUP_ID_CONFIG, "credit-service");
        properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");

        return new DefaultKafkaConsumerFactory<>(
                properties,
                new StringDeserializer(),
                new ErrandExpiredEventDeserializer()
        );
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, ErrandExpiredEvent>
    errandExpiredKafkaListenerContainerFactory(
            ConsumerFactory<String, ErrandExpiredEvent> errandExpiredConsumerFactory) {
        ConcurrentKafkaListenerContainerFactory<String, ErrandExpiredEvent> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(errandExpiredConsumerFactory);
        return factory;
    }

    private static final class ErrandExpiredEventDeserializer
            implements Deserializer<ErrandExpiredEvent> {

        private final JsonMapper jsonMapper = JsonMapper.builder().build();

        @Override
        public ErrandExpiredEvent deserialize(String topic, byte[] data) {
            if (data == null) {
                return null;
            }
            try {
                return jsonMapper.readValue(data, ErrandExpiredEvent.class);
            } catch (Exception exception) {
                throw new SerializationException(
                        "Could not deserialize errand.expired event", exception);
            }
        }
    }
}
