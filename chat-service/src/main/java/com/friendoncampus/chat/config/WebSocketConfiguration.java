package com.friendoncampus.chat.config;

import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.*;
import org.springframework.messaging.simp.config.*;
import org.springframework.messaging.simp.stomp.*;
import org.springframework.messaging.support.*;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.*;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import org.springframework.web.socket.config.annotation.*;
import com.friendoncampus.chat.authorization.CurrentAuthorization;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfiguration implements WebSocketMessageBrokerConfigurer {
    private final JwtDecoder decoder;
    private final JwtAuthenticationConverter converter;
    private final CurrentAuthorization current;
    private final Map<String,WebSocketSession> sessions=new ConcurrentHashMap<>();
    private final Map<String,Jwt> actors=new ConcurrentHashMap<>();
    public WebSocketConfiguration(JwtDecoder decoder,JwtAuthenticationConverter converter,CurrentAuthorization current) {
        this.decoder=decoder;this.converter=converter;this.current=current;
    }
    @Override public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws/chat").setAllowedOriginPatterns("*");
    }
    @Override public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/queue");registry.setUserDestinationPrefix("/user");
    }
    @Override public void configureWebSocketTransport(WebSocketTransportRegistration registry) {
        registry.addDecoratorFactory(handler -> new WebSocketHandlerDecorator(handler) {
            @Override public void afterConnectionEstablished(WebSocketSession session) throws Exception {
                sessions.put(session.getId(),session);
                try { super.afterConnectionEstablished(session); }
                catch(Exception ex) { sessions.remove(session.getId());throw ex; }
            }
            @Override public void afterConnectionClosed(WebSocketSession session,CloseStatus status) throws Exception {
                actors.remove(session.getId());sessions.remove(session.getId());
                super.afterConnectionClosed(session,status);
            }
        });
    }
    @Override public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override public Message<?> preSend(Message<?> message,MessageChannel channel) {
                StompHeaderAccessor a=MessageHeaderAccessor.getAccessor(message,StompHeaderAccessor.class);
                if(a==null || a.getCommand()==null) return message;
                if(a.getCommand()==StompCommand.DISCONNECT) { actors.remove(a.getSessionId());return message; }
                try {
                    if(a.getCommand()==StompCommand.CONNECT) {
                        String h=a.getFirstNativeHeader("Authorization");
                        if(h==null || !h.startsWith("Bearer ")) throw new IllegalArgumentException("Bearer token required");
                        Jwt jwt=decoder.decode(h.substring(7));current.require(jwt);
                        a.setUser(converter.convert(jwt));actors.put(a.getSessionId(),jwt);
                    } else {
                        Jwt jwt=actors.get(a.getSessionId());
                        if(jwt==null) throw new IllegalArgumentException("Authentication required");
                        current.require(jwt);
                        if(a.getCommand()==StompCommand.SUBSCRIBE && !"/user/queue/chat".equals(a.getDestination()))
                            throw new IllegalArgumentException("Invalid subscription");
                        // Mutations use the authorized REST API; no STOMP SEND destinations exist.
                        if(a.getCommand()==StompCommand.SEND) throw new IllegalArgumentException("Use the message REST API");
                    }
                    return message;
                } catch(RuntimeException ex) { terminate(a.getSessionId());throw ex; }
            }
        });
    }
    @Override public void configureClientOutboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override public Message<?> preSend(Message<?> message,MessageChannel channel) {
                StompHeaderAccessor a=StompHeaderAccessor.wrap(message);
                if(a.getMessageType()!=org.springframework.messaging.simp.SimpMessageType.MESSAGE) return message;
                try {
                    Jwt jwt=actors.get(a.getSessionId());
                    if(jwt==null) throw new IllegalArgumentException("Authentication required");
                    current.require(jwt);
                    return message;
                } catch(RuntimeException ex) { terminate(a.getSessionId());return null; }
            }
        });
    }
    private void terminate(String id) {
        if(id==null)return;
        actors.remove(id);
        WebSocketSession session=sessions.remove(id);
        if(session!=null)try { session.close(CloseStatus.POLICY_VIOLATION); } catch(java.io.IOException ignored) { }
    }
}
