package com.friendoncampus.chat.translation;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.friendoncampus.chat.translation.ChatTranslationService.TranslationJob;

import tools.jackson.databind.json.JsonMapper;

@Component
@ConditionalOnProperty(name="app.translation.provider",havingValue="gemini")
@ConditionalOnProperty(name="app.rabbit.enabled",havingValue="true",matchIfMissing=true)
public class TranslationJobBridge {
    static final String EXCHANGE="chat.translation";
    static final String QUEUE="chat.translation.jobs";
    static final String ROUTING_KEY="translate";
    private final RabbitTemplate rabbit;
    private final ChatTranslationService translations;
    private final JsonMapper json=JsonMapper.builder().build();

    public TranslationJobBridge(RabbitTemplate rabbit,ChatTranslationService translations){this.rabbit=rabbit;this.translations=translations;}

    @Scheduled(fixedDelayString="${app.translation.dispatch-delay-ms:1500}")
    public void dispatch(){translations.claimPending(20).forEach(job->rabbit.convertAndSend(EXCHANGE,ROUTING_KEY,json.writeValueAsString(job)));}

    @RabbitListener(queues=QUEUE)
    public void receive(String payload){translations.process(json.readValue(payload,TranslationJob.class));}

    @Configuration
    static class RabbitConfig {
        @Bean DirectExchange chatTranslationExchange(){return new DirectExchange(EXCHANGE,true,false);}
        @Bean Queue chatTranslationQueue(){return new Queue(QUEUE,true);}
        @Bean Binding chatTranslationBinding(Queue chatTranslationQueue,DirectExchange chatTranslationExchange){return BindingBuilder.bind(chatTranslationQueue).to(chatTranslationExchange).with(ROUTING_KEY);}
    }
}
