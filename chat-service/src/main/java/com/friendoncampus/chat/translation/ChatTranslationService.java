package com.friendoncampus.chat.translation;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.friendoncampus.chat.domain.ChatLanguage;
import com.friendoncampus.chat.service.ChatAccessException;
import com.friendoncampus.chat.service.ChatConversationService;
import com.friendoncampus.chat.service.ChatConversationService.ChatMessageSaved;
import com.friendoncampus.chat.service.ChatConversationService.Message;
import com.friendoncampus.chat.service.ChatPreferenceService;

@Service
public class ChatTranslationService {
    private final JdbcClient db;
    private final Clock clock;
    private final ChatConversationService chats;
    private final ChatPreferenceService preferences;
    private final Optional<TranslationProvider> provider;
    private final ApplicationEventPublisher events;
    private final int maxAttempts;

    public ChatTranslationService(JdbcClient db, Clock clock, ChatConversationService chats,
            ChatPreferenceService preferences, Optional<TranslationProvider> provider,
            ApplicationEventPublisher events,
            @Value("${app.translation.max-attempts:3}") int maxAttempts) {
        this.db = db; this.clock = clock; this.chats = chats; this.preferences = preferences;
        this.provider = provider; this.events = events; this.maxAttempts = maxAttempts;
    }

    public record Translation(UUID messageId, String sourceLanguage, String targetLanguage,
            String status, String text) {}
    public record TranslationJob(UUID translationId) {}
    public record TranslationChanged(String type, UUID conversationId, Translation translation) {}

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void scheduleIncomingTranslations(ChatMessageSaved event) {
        Message message = event.message();
        if (provider.isEmpty() || !("TEXT".equals(message.messageType()) || "QUICK_REPLY".equals(message.messageType()))) return;
        chats.messageRecipients(message.id()).stream()
                .filter(user -> !user.equals(message.senderUserId()))
                .map(preferences::get).distinct()
                .filter(language -> message.originalLanguage() == null
                        || !language.name().equalsIgnoreCase(message.originalLanguage()))
                .forEach(language -> create(message.id(), language));
    }

    @Transactional
    public Translation request(UUID conversationId, UUID messageId, UUID actor, String targetLanguage) {
        chats.requireParticipant(conversationId, actor);
        ChatLanguage target = ChatLanguage.fromCode(targetLanguage);
        Message message = messageForConversation(conversationId, messageId, actor);
        if (!("TEXT".equals(message.messageType()) || "QUICK_REPLY".equals(message.messageType()))) {
            throw new IllegalArgumentException("Only text messages can be translated");
        }
        if (message.originalLanguage() != null && target.name().equalsIgnoreCase(message.originalLanguage())) {
            throw new IllegalArgumentException("Message is already in the requested language");
        }
        return create(messageId, target);
    }

    @Transactional(readOnly = true)
    public Translation get(UUID conversationId, UUID messageId, UUID actor, String targetLanguage) {
        chats.requireParticipant(conversationId, actor);
        ChatLanguage target = ChatLanguage.fromCode(targetLanguage);
        messageForConversation(conversationId, messageId, actor);
        return toResponse(findStored(messageId, target.name()).orElseThrow(ChatAccessException::new));
    }

    @Transactional
    public List<TranslationJob> claimPending(int limit) {
        recoverAbandoned();
        return db.sql("""
                WITH candidates AS (
                  SELECT id FROM chat_translations
                  WHERE status='PENDING' AND next_attempt_at<=:now
                  ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT :limit
                )
                UPDATE chat_translations t SET status='PROCESSING',attempts=attempts+1,updated_at=:now
                FROM candidates c WHERE t.id=c.id RETURNING t.id
                """).param("now", now()).param("limit", Math.min(Math.max(limit, 1), 50))
                .query((rs,n) -> new TranslationJob(rs.getObject("id", UUID.class))).list();
    }

    @Transactional
    public void process(TranslationJob job) {
        var work = db.sql("""
                SELECT t.id,t.message_id,t.target_language,t.attempts,m.conversation_id,
                       m.original_language,m.text_content
                FROM chat_translations t JOIN chat_messages m ON m.id=t.message_id
                WHERE t.id=:id AND t.status='PROCESSING'
                """).param("id", job.translationId()).query((rs,n) -> new Work(
                    rs.getObject("id",UUID.class),rs.getObject("message_id",UUID.class),
                    rs.getString("target_language"),rs.getInt("attempts"),
                    rs.getObject("conversation_id",UUID.class),rs.getString("original_language"),
                    rs.getString("text_content"))).optional();
        if (work.isEmpty()) return;
        Work item = work.get();
        try {
            TranslationProvider selected = provider.orElseThrow(() -> new IllegalStateException("Translation provider is disabled"));
            String translated = selected.translate(item.text(), lower(item.sourceLanguage()), lower(item.targetLanguage()));
            OffsetDateTime now = now();
            db.sql("""
                    UPDATE chat_translations SET status='READY',translated_text=:text,last_error=NULL,
                      completed_at=:now,updated_at=:now WHERE id=:id
                    """).param("text",translated).param("now",now).param("id",item.id()).update();
            events.publishEvent(new TranslationChanged("TRANSLATION_UPDATED", item.conversationId(),
                    toResponse(findStored(item.messageId(), item.targetLanguage()).orElseThrow())));
        } catch (RuntimeException failure) {
            boolean exhausted = item.attempts() >= maxAttempts;
            OffsetDateTime next = now().plusSeconds(Math.min(30, 1L << Math.min(item.attempts(), 5)));
            db.sql("""
                    UPDATE chat_translations SET status=:status,next_attempt_at=:next,last_error=:error,
                      updated_at=:now WHERE id=:id
                    """).param("status",exhausted?"FAILED":"PENDING").param("next",next)
                    .param("error",safeError(failure)).param("now",now()).param("id",item.id()).update();
            if (exhausted) events.publishEvent(new TranslationChanged("TRANSLATION_UPDATED", item.conversationId(),
                    toResponse(findStored(item.messageId(), item.targetLanguage()).orElseThrow())));
        }
    }

    private Translation create(UUID messageId, ChatLanguage target) {
        TranslationProvider selected = provider.orElseThrow(() -> new IllegalStateException("Translation provider is disabled"));
        OffsetDateTime now = now(); UUID id = UUID.randomUUID();
        db.sql("""
                INSERT INTO chat_translations(id,message_id,target_language,provider,model,status,
                  translated_text,attempts,next_attempt_at,last_error,created_at,updated_at,completed_at)
                VALUES(:id,:message,:language,:provider,:model,'PENDING',NULL,0,:now,NULL,:now,:now,NULL)
                ON CONFLICT(message_id,target_language,provider,model) DO NOTHING
                """).param("id",id).param("message",messageId).param("language",target.name())
                .param("provider",selected.name()).param("model",selected.model()).param("now",now).update();
        db.sql("""
                UPDATE chat_translations SET status='PENDING',attempts=0,next_attempt_at=:now,
                  last_error=NULL,updated_at=:now,completed_at=NULL
                WHERE message_id=:message AND target_language=:language AND provider=:provider
                  AND model=:model AND status='FAILED'
                """).param("now",now).param("message",messageId).param("language",target.name())
                .param("provider",selected.name()).param("model",selected.model()).update();
        return toResponse(findStored(messageId, target.name()).orElseThrow());
    }

    private Optional<StoredTranslation> findStored(UUID messageId, String target) {
        return db.sql("""
                SELECT t.id,t.message_id,m.original_language,t.target_language,t.provider,t.model,
                       t.status,t.translated_text,t.attempts,t.last_error,t.updated_at
                FROM chat_translations t JOIN chat_messages m ON m.id=t.message_id
                WHERE t.message_id=:message AND t.target_language=:target
                ORDER BY t.created_at DESC LIMIT 1
                """).param("message",messageId).param("target",target.toUpperCase())
                .query((rs,n)->new StoredTranslation(rs.getObject("id",UUID.class),
                        rs.getObject("message_id",UUID.class),lower(rs.getString("original_language")),
                        rs.getString("target_language").toLowerCase(),
                        rs.getString("provider"),rs.getString("model"),rs.getString("status"),
                        rs.getString("translated_text"),rs.getInt("attempts"),rs.getString("last_error"),
                        rs.getObject("updated_at",OffsetDateTime.class))).optional();
    }

    private static Translation toResponse(StoredTranslation stored) {
        String publicStatus = "PROCESSING".equals(stored.status()) ? "PENDING" : stored.status();
        return new Translation(stored.messageId(),stored.sourceLanguage(),stored.targetLanguage(),
                publicStatus,stored.translatedText());
    }

    private Message messageForConversation(UUID conversationId, UUID messageId, UUID actor) {
        return chats.message(conversationId, messageId, actor);
    }

    private void recoverAbandoned() {
        db.sql("""
                UPDATE chat_translations SET status='PENDING',next_attempt_at=:now,updated_at=:now,
                  last_error='Translation worker was interrupted and the job was recovered'
                WHERE status='PROCESSING' AND updated_at<:cutoff
                """).param("now",now()).param("cutoff",now().minusSeconds(30)).update();
    }
    private OffsetDateTime now(){return OffsetDateTime.now(clock);}
    private static String lower(String language){return language==null?"auto":language.toLowerCase();}
    private static String safeError(Throwable failure){String value=failure.getMessage();if(value==null||value.isBlank())value=failure.getClass().getSimpleName();return value.substring(0,Math.min(value.length(),240));}
    private record Work(UUID id,UUID messageId,String targetLanguage,int attempts,UUID conversationId,String sourceLanguage,String text){}
    private record StoredTranslation(UUID id,UUID messageId,String sourceLanguage,String targetLanguage,
            String provider,String model,String status,String translatedText,int attempts,String lastError,
            OffsetDateTime updatedAt){}
}
