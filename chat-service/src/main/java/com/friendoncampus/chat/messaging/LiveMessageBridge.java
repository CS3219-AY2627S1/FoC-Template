package com.friendoncampus.chat.messaging;

import org.springframework.amqp.core.AnonymousQueue;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.FanoutExchange;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.friendoncampus.chat.service.ChatConversationService;
import com.friendoncampus.chat.service.ChatConversationService.ChatMessageSaved;
import com.friendoncampus.chat.translation.ChatTranslationService.TranslationChanged;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
@ConditionalOnProperty(name="app.rabbit.enabled",havingValue="true",matchIfMissing=true)
public class LiveMessageBridge {
    public static final String EXCHANGE="chat.live";
    private final RabbitTemplate rabbit; private final SimpMessagingTemplate websocket; private final ChatConversationService chats; private final JsonMapper json=JsonMapper.builder().build();
    public LiveMessageBridge(RabbitTemplate rabbit,SimpMessagingTemplate websocket,ChatConversationService chats){this.rabbit=rabbit;this.websocket=websocket;this.chats=chats;}
    @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
    public void publish(ChatMessageSaved event){rabbit.convertAndSend(EXCHANGE,"",json.writeValueAsString(event.message()));}
    @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
    public void publishTranslation(TranslationChanged event){rabbit.convertAndSend(EXCHANGE,"",json.writeValueAsString(event));}
    @RabbitListener(queues="#{chatLiveQueue.name}")
    public void receive(String payload){JsonNode node=json.readTree(payload);String messageId=node.hasNonNull("id")?node.path("id").asText():node.path("translation").path("messageId").asText();chats.messageRecipients(java.util.UUID.fromString(messageId)).forEach(user->websocket.convertAndSendToUser(user.toString(),"/queue/chat",payload));}

    @Configuration
    static class RabbitConfig {
        @Bean FanoutExchange chatLiveExchange(){return new FanoutExchange(EXCHANGE,true,false);}
        @Bean AnonymousQueue chatLiveQueue(){return new AnonymousQueue();}
        @Bean Binding chatLiveBinding(AnonymousQueue chatLiveQueue,FanoutExchange chatLiveExchange){return BindingBuilder.bind(chatLiveQueue).to(chatLiveExchange);}
    }
}
