package com.friendoncampus.chat.service;

import java.security.MessageDigest;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.friendoncampus.chat.domain.ChatLanguage;
import com.friendoncampus.chat.domain.QuickReplyKey;
import com.friendoncampus.chat.messaging.ChatNotificationOutbox;
import com.friendoncampus.chat.storage.AttachmentStorageException;
import com.friendoncampus.chat.storage.AttachmentStorageRouter;

@Service
public class ChatConversationService {
    private static final Logger log = LoggerFactory.getLogger(ChatConversationService.class);
    private final JdbcClient db;
    private final Clock clock;
    private final QuickReplyCatalog quickReplies;
    private final ChatPreferenceService preferences;
    private final ApplicationEventPublisher events;
    private final AttachmentStorageRouter attachmentStorage;
    private final CaseConversationAccessGuard caseAccessGuard;
    private final ChatNotificationOutbox notificationOutbox;

    public ChatConversationService(JdbcClient db, Clock clock, QuickReplyCatalog quickReplies,
            ChatPreferenceService preferences, ApplicationEventPublisher events,
            AttachmentStorageRouter attachmentStorage, CaseConversationAccessGuard caseAccessGuard,
            ChatNotificationOutbox notificationOutbox) {
        this.db = db; this.clock = clock; this.quickReplies = quickReplies;
        this.preferences = preferences; this.events = events; this.attachmentStorage = attachmentStorage;
        this.caseAccessGuard = caseAccessGuard;
        this.notificationOutbox = notificationOutbox;
    }

    public record Conversation(UUID id, UUID orderId, String status, boolean readOnly) {}
    public record Attachment(UUID id, String contentType, String filename, long size) {}
    public record Message(UUID id, UUID conversationId, UUID senderUserId, long sequence,
            UUID clientMessageId, String messageType, String originalLanguage, String quickReplyKey,
            String text, Attachment attachment, UUID sourceEventId, Long sourceSequence,
            String lifecycleAction, String lifecycleFromState, String lifecycleToState,
            OffsetDateTime createdAt) {}
    public record StoredAttachment(String contentType, String filename, byte[] content) {}

    @Transactional(readOnly = true)
    public Conversation byOrder(UUID orderId, UUID actor) {
        return db.sql("""
                SELECT c.id,c.order_id,c.status,EXISTS(SELECT 1 FROM chat_participants w
                  WHERE w.conversation_id=c.id AND w.user_id=:actor AND w.can_write AND w.valid_until IS NULL) AND NOT EXISTS(SELECT 1 FROM chat_errand_reviews review WHERE review.order_id=c.order_id AND c.conversation_type='ERRAND') AS actor_can_write
                FROM chat_conversations c
                WHERE c.order_id=:orderId AND c.conversation_type='ERRAND'
                AND EXISTS (SELECT 1 FROM chat_participants p WHERE p.conversation_id=c.id AND p.user_id=:actor)
                """).param("orderId", orderId).param("actor", actor).query((rs, n) ->
                    new Conversation(rs.getObject("id", UUID.class), rs.getObject("order_id", UUID.class),
                        rs.getString("status"), "READ_ONLY".equals(rs.getString("status")) || !rs.getBoolean("actor_can_write"))).optional()
                .orElseThrow(ChatAccessException::new);
    }

    @Transactional(readOnly = true)
    public Conversation get(UUID id, UUID actor) {
        var access=caseAccessGuard.access(id,actor);
        if(access!=null)return db.sql("SELECT id,order_id,status FROM chat_conversations WHERE id=:id")
                .param("id",id).query((rs,n)->new Conversation(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),
                    rs.getString(3),!access.path("canWriteConversation").asBoolean()||!"ACTIVE".equals(rs.getString(3)))).single();
        return db.sql("""
                SELECT c.id,c.order_id,c.status,EXISTS(SELECT 1 FROM chat_participants w
                  WHERE w.conversation_id=c.id AND w.user_id=:actor AND w.can_write AND w.valid_until IS NULL) AND NOT EXISTS(SELECT 1 FROM chat_errand_reviews review WHERE review.order_id=c.order_id AND c.conversation_type='ERRAND') AS actor_can_write
                FROM chat_conversations c
                WHERE c.id=:id AND EXISTS (SELECT 1 FROM chat_participants p WHERE p.conversation_id=c.id AND p.user_id=:actor)
                """).param("id", id).param("actor", actor).query((rs,n) ->
                    new Conversation(rs.getObject("id", UUID.class), rs.getObject("order_id", UUID.class),
                        rs.getString("status"), "READ_ONLY".equals(rs.getString("status")) || !rs.getBoolean("actor_can_write"))).optional()
                .orElseThrow(ChatAccessException::new);
    }

    @Transactional(readOnly = true)
    public List<Message> messages(UUID id, UUID actor, long after, int limit) {
        requireParticipant(id, actor);
        boolean requester = caseAccessGuard.requireRead(id,actor)||relationship(id, actor).equals("REQUESTER");
        return db.sql("""
            SELECT m.id,m.conversation_id,m.sender_user_id,m.sequence,m.client_message_id,m.message_type,
              m.original_language,m.quick_reply_key,m.text_content,m.created_at,m.attachment_id,
              m.source_event_id,m.source_sequence,m.lifecycle_action,m.lifecycle_from_state,m.lifecycle_to_state,
              a.content_type,a.original_filename,a.size_bytes
            FROM chat_messages m LEFT JOIN chat_attachments a ON a.id=m.attachment_id
            WHERE m.conversation_id=:id AND m.sequence>:after
              AND (:requester OR m.assignment_epoch IN (SELECT assignment_epoch FROM chat_participants
                   WHERE conversation_id=:id AND user_id=:actor))
            ORDER BY m.sequence ASC LIMIT :limit
            """).param("id", id).param("after", after).param("requester", requester)
                .param("actor", actor)
                .param("limit", Math.min(Math.max(limit, 1), 100))
                .query((rs,n) -> mapMessage(rs)).list();
    }

    @Transactional(readOnly = true)
    public Message message(UUID conversationId, UUID messageId, UUID actor) {
        return db.sql("""
                SELECT m.*,a.content_type,a.original_filename,a.size_bytes
                FROM chat_messages m LEFT JOIN chat_attachments a ON a.id=m.attachment_id
                WHERE m.id=:messageId AND m.conversation_id=:conversationId AND (
                  EXISTS(SELECT 1 FROM chat_participants requester
                    WHERE requester.conversation_id=:conversationId AND requester.user_id=:actor
                      AND requester.relationship='REQUESTER')
                  OR m.assignment_epoch IN (SELECT assignment_epoch FROM chat_participants participant
                    WHERE participant.conversation_id=:conversationId AND participant.user_id=:actor)
                )
                """).param("messageId",messageId).param("conversationId",conversationId).param("actor",actor)
                .query((rs,n)->mapMessage(rs)).optional().orElseThrow(ChatAccessException::new);
    }

    @Transactional
    public Message sendText(UUID id, UUID actor, UUID clientId, String type, String text, String quickKey) {
        requireWritable(id, actor);
        String normalizedType = type == null ? "TEXT" : type;
        String content;
        String key = null;
        if ("QUICK_REPLY".equals(normalizedType)) {
            try { key = QuickReplyKey.valueOf(quickKey).name(); }
            catch (Exception e) { throw new IllegalArgumentException("Unknown quick reply"); }
            ChatLanguage language = preferences.get(actor);
            final String selected = key;
            content = quickReplies.list(language).stream().filter(q -> q.key().name().equals(selected))
                    .findFirst().orElseThrow().text();
        } else {
            normalizedType = "TEXT";
            content = text == null ? "" : text.trim();
            if (content.isEmpty() || content.length() > 4000) throw new IllegalArgumentException("Message must contain 1 to 4000 characters");
        }
        String language = preferences.get(actor).name();
        return insertMessage(id, actor, clientId, normalizedType, content, key, language, null);
    }

    @Transactional
    public Attachment upload(UUID id, UUID actor, MultipartFile file) {
        requireWritable(id, actor);
        if (file == null || file.isEmpty() || file.getSize() > 5L * 1024 * 1024) throw new IllegalArgumentException("Image must be between 1 byte and 5 MiB");
        String type = file.getContentType();
        if (!List.of("image/jpeg","image/png","image/webp").contains(type)) throw new IllegalArgumentException("Only JPEG, PNG and WebP images are supported");
        try {
            UUID attachmentId = UUID.randomUUID();
            byte[] content=file.getBytes();
            if(!matchesImageSignature(type,content))throw new IllegalArgumentException("Image content does not match its declared type");
            String name = file.getOriginalFilename() == null ? "image" : file.getOriginalFilename().replaceAll("[\\r\\n]", "");
            if(name.length()>255)name=name.substring(0,255);
            var stored = attachmentStorage.put(id, attachmentId, type, content);
            registerStorageRollback(stored.provider(), stored.objectKey());
            db.sql("""
                    INSERT INTO chat_attachments(
                        id,conversation_id,owner_user_id,content_type,original_filename,size_bytes,
                        content,storage_provider,object_key,checksum_sha256,created_at)
                    VALUES(:id,:cid,:actor,:type,:name,:size,:content,:provider,:objectKey,:checksum,:at)
                    """)
                .param("id",attachmentId).param("cid",id).param("actor",actor).param("type",type)
                .param("name",name).param("size",file.getSize())
                .param("content",stored.inlineContent(),java.sql.Types.BINARY)
                .param("provider",stored.provider()).param("objectKey",stored.objectKey())
                .param("checksum",sha256(content)).param("at",now()).update();
            return new Attachment(attachmentId,type,name,file.getSize());
        } catch (java.io.IOException e) { throw new IllegalArgumentException("Image could not be read", e); }
    }

    @Transactional
    public Message sendImage(UUID id, UUID actor, UUID clientId, UUID attachmentId) {
        requireWritable(id, actor);
        int owned = db.sql("SELECT count(*) FROM chat_attachments WHERE id=:aid AND conversation_id=:cid AND owner_user_id=:actor")
                .param("aid",attachmentId).param("cid",id).param("actor",actor).query(Integer.class).single();
        if (owned != 1) throw new ChatAccessException();
        return insertMessage(id,actor,clientId,"IMAGE",null,null,null,attachmentId);
    }

    /**
     * Appends one immutable, user-visible lifecycle entry derived from an Order event. The source
     * identifiers remain structured fields so a future Admin evidence view never has to parse the
     * display text. This method is internal to Chat's Kafka projection; browser callers cannot
     * create SYSTEM messages.
     */
    @Transactional
    public Message appendLifecycleMessage(UUID conversationId, UUID eventId, long sourceSequence,
            String action, String fromState, String toState, String text, Integer assignmentEpoch,
            OffsetDateTime occurredAt) {
        Message existing = findBySourceEvent(eventId);
        if (existing != null) return existing;
        long sequence = db.sql("UPDATE chat_conversations SET next_sequence=next_sequence+1,updated_at=:at WHERE id=:id RETURNING next_sequence-1")
                .param("at", now()).param("id", conversationId).query(Long.class).single();
        UUID messageId = UUID.randomUUID();
        db.sql("""
                INSERT INTO chat_messages(
                    id,conversation_id,sender_user_id,sequence,client_message_id,message_type,
                    original_language,quick_reply_key,text_content,attachment_id,assignment_epoch,
                    source_event_id,source_sequence,lifecycle_action,lifecycle_from_state,
                    lifecycle_to_state,created_at)
                VALUES(:id,:conversationId,NULL,:sequence,NULL,'SYSTEM',NULL,NULL,:text,NULL,:epoch,
                    :eventId,:sourceSequence,:action,:fromState,:toState,:occurredAt)
                """).param("id", messageId).param("conversationId", conversationId)
                .param("sequence", sequence).param("text", text)
                .param("epoch", assignmentEpoch, java.sql.Types.INTEGER)
                .param("eventId", eventId).param("sourceSequence", sourceSequence)
                .param("action", action).param("fromState", fromState).param("toState", toState)
                .param("occurredAt", occurredAt).update();
        Message saved = findMessage(messageId);
        events.publishEvent(new ChatMessageSaved(saved));
        return saved;
    }

    @Transactional(readOnly = true)
    public StoredAttachment attachment(UUID conversationId, UUID attachmentId, UUID actor) {
        boolean caseReader=caseAccessGuard.requireRead(conversationId,actor);
        StoredAttachmentRecord stored = db.sql("""
                SELECT a.content_type,a.original_filename,a.content,a.storage_provider,a.object_key,a.checksum_sha256
                FROM chat_attachments a
                JOIN chat_messages m ON m.attachment_id=a.id
                WHERE a.id=:aid AND a.conversation_id=:cid AND (
                  :caseReader OR a.owner_user_id=:actor OR EXISTS(
                    SELECT 1 FROM chat_participants p WHERE p.conversation_id=:cid AND p.user_id=:actor
                      AND (p.relationship='REQUESTER' OR p.assignment_epoch=m.assignment_epoch)))
                """).param("aid",attachmentId).param("cid",conversationId).param("actor",actor).param("caseReader",caseReader)
                .query((rs,n)->new StoredAttachmentRecord(rs.getString("content_type"),
                        rs.getString("original_filename"),rs.getBytes("content"),
                        rs.getString("storage_provider"),rs.getString("object_key"),
                        rs.getString("checksum_sha256"))).optional()
                .orElseThrow(ChatAccessException::new);
        byte[] content = attachmentStorage.get(stored.provider(), stored.objectKey(), stored.inlineContent());
        if (stored.checksum() != null && !stored.checksum().equals(sha256(content))) {
            throw new AttachmentStorageException("Stored image checksum does not match its metadata");
        }
        return new StoredAttachment(stored.contentType(), stored.filename(), content);
    }

    public void requireParticipant(UUID id, UUID actor) {
        if(caseAccessGuard.requireRead(id,actor))return;
        int count=db.sql("SELECT count(*) FROM chat_participants WHERE conversation_id=:id AND user_id=:actor")
                .param("id",id).param("actor",actor).query(Integer.class).single();
        if(count==0) throw new ChatAccessException();
    }
    @Transactional(readOnly = true)
    public List<UUID> messageRecipients(UUID messageId){
        return db.sql("""
                SELECT DISTINCT p.user_id FROM chat_messages m
                JOIN chat_participants p ON p.conversation_id=m.conversation_id
                WHERE m.id=:messageId AND (p.relationship='REQUESTER' OR p.assignment_epoch=m.assignment_epoch)
                """).param("messageId",messageId).query(UUID.class).list().stream().filter(actor->{
                    UUID conversation=db.sql("SELECT conversation_id FROM chat_messages WHERE id=:id").param("id",messageId).query(UUID.class).single();
                    try{requireParticipant(conversation,actor);return true;}catch(ChatAccessException ex){return false;}
                }).toList();
    }
    private String relationship(UUID id,UUID actor){return db.sql("SELECT relationship FROM chat_participants WHERE conversation_id=:id AND user_id=:actor ORDER BY assignment_epoch DESC LIMIT 1").param("id",id).param("actor",actor).query(String.class).optional().orElseThrow(ChatAccessException::new);}
    private void requireWritable(UUID id, UUID actor){
        if (!caseAccessGuard.refresh(id, actor)) throw new ChatConflictException("This conversation is read-only");
        // The closure barrier drains this lock; no Admin/User callback occurs after it.
        db.sql("SELECT id FROM chat_conversations WHERE id=:id FOR UPDATE").param("id",id).query(UUID.class).optional().orElseThrow(ChatAccessException::new);
        int closed=db.sql("SELECT count(*) FROM chat_conversations c JOIN chat_case_closures x ON x.case_id=c.case_id WHERE c.id=:id")
                .param("id",id).query(Integer.class).single();
        int reviewed=db.sql("SELECT count(*) FROM chat_conversations c JOIN chat_errand_reviews r ON r.order_id=c.order_id WHERE c.id=:id AND c.conversation_type='ERRAND'").param("id",id).query(Integer.class).single();
        if(reviewed!=0)throw new ChatConflictException("This errand is under review");
        if(closed!=0)throw new ChatConflictException("This conversation is read-only");
        int count=db.sql("SELECT count(*) FROM chat_participants p JOIN chat_conversations c ON c.id=p.conversation_id WHERE p.conversation_id=:id AND p.user_id=:actor AND p.can_write AND p.valid_until IS NULL AND c.status='ACTIVE'").param("id",id).param("actor",actor).query(Integer.class).single();
        if(count==0) throw new ChatConflictException("This conversation is read-only");
    }
    private Message insertMessage(UUID id,UUID actor,UUID clientId,String type,String text,String key,String language,UUID attachmentId){
        Message existing=findByClient(id,actor,clientId);
        if(existing!=null){String expected=hash(type,text,key,attachmentId);String actual=hash(existing.messageType(),existing.text(),existing.quickReplyKey(),existing.attachment()==null?null:existing.attachment().id());if(!expected.equals(actual))throw new ChatConflictException("clientMessageId was already used for different content");return existing;}
        long seq=db.sql("UPDATE chat_conversations SET next_sequence=next_sequence+1,updated_at=:at WHERE id=:id RETURNING next_sequence-1").param("at",now()).param("id",id).query(Long.class).single();
        int epoch=db.sql("""
                SELECT CASE WHEN sender.relationship='REQUESTER' THEN COALESCE((
                    SELECT courier.assignment_epoch FROM chat_participants courier
                    WHERE courier.conversation_id=:id AND courier.relationship='COURIER'
                      AND courier.valid_until IS NULL
                    ORDER BY courier.assignment_epoch DESC LIMIT 1
                ),sender.assignment_epoch) ELSE sender.assignment_epoch END
                FROM chat_participants sender
                WHERE sender.conversation_id=:id AND sender.user_id=:actor
                  AND sender.valid_until IS NULL
                ORDER BY sender.assignment_epoch DESC LIMIT 1
                """).param("id",id).param("actor",actor).query(Integer.class).single();
        UUID mid=UUID.randomUUID();
        try{db.sql("INSERT INTO chat_messages(id,conversation_id,sender_user_id,sequence,client_message_id,message_type,original_language,quick_reply_key,text_content,attachment_id,assignment_epoch,created_at) VALUES(:mid,:cid,:actor,:seq,:client,:type,:lang,:key,:text,:aid,:epoch,:at)")
            .param("mid",mid).param("cid",id).param("actor",actor).param("seq",seq).param("client",clientId).param("type",type).param("lang",language).param("key",key).param("text",text).param("aid",attachmentId).param("epoch",epoch).param("at",now()).update();}
        catch(DuplicateKeyException e){return findByClient(id,actor,clientId);}
        Message saved=findMessage(mid);
        notificationOutbox.enqueue(saved);
        events.publishEvent(new ChatMessageSaved(saved));
        return saved;
    }
    private Message findByClient(UUID id,UUID actor,UUID client){return db.sql("SELECT m.*,a.content_type,a.original_filename,a.size_bytes FROM chat_messages m LEFT JOIN chat_attachments a ON a.id=m.attachment_id WHERE m.conversation_id=:id AND m.sender_user_id=:actor AND m.client_message_id=:client").param("id",id).param("actor",actor).param("client",client).query((rs,n)->mapMessage(rs)).optional().orElse(null);}
    private Message findBySourceEvent(UUID eventId){return db.sql("SELECT m.*,a.content_type,a.original_filename,a.size_bytes FROM chat_messages m LEFT JOIN chat_attachments a ON a.id=m.attachment_id WHERE m.source_event_id=:eventId").param("eventId",eventId).query((rs,n)->mapMessage(rs)).optional().orElse(null);}
    private Message findMessage(UUID id){return db.sql("SELECT m.*,a.content_type,a.original_filename,a.size_bytes FROM chat_messages m LEFT JOIN chat_attachments a ON a.id=m.attachment_id WHERE m.id=:id").param("id",id).query((rs,n)->mapMessage(rs)).single();}
    private static Message mapMessage(java.sql.ResultSet rs)throws java.sql.SQLException{UUID aid=rs.getObject("attachment_id",UUID.class);Attachment a=aid==null?null:new Attachment(aid,rs.getString("content_type"),rs.getString("original_filename"),rs.getLong("size_bytes"));return new Message(rs.getObject("id",UUID.class),rs.getObject("conversation_id",UUID.class),rs.getObject("sender_user_id",UUID.class),rs.getLong("sequence"),rs.getObject("client_message_id",UUID.class),rs.getString("message_type"),rs.getString("original_language"),rs.getString("quick_reply_key"),rs.getString("text_content"),a,rs.getObject("source_event_id",UUID.class),rs.getObject("source_sequence",Long.class),rs.getString("lifecycle_action"),rs.getString("lifecycle_from_state"),rs.getString("lifecycle_to_state"),rs.getObject("created_at",OffsetDateTime.class));}
    private OffsetDateTime now(){return OffsetDateTime.now(clock);}
    private void registerStorageRollback(String provider,String objectKey){
        if(objectKey==null)return;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){
            @Override public void afterCompletion(int status){
                if(status!=TransactionSynchronization.STATUS_COMMITTED){
                    try {
                        attachmentStorage.delete(provider,objectKey);
                    } catch (RuntimeException exception) {
                        log.error("Could not remove rolled-back attachment object {}", objectKey, exception);
                    }
                }
            }
        });
    }
    private static boolean matchesImageSignature(String type,byte[] c){
        if(c==null)return false;
        return switch(type){
            case "image/jpeg" -> c.length>=3&&(c[0]&255)==0xff&&(c[1]&255)==0xd8&&(c[2]&255)==0xff;
            case "image/png" -> c.length>=8&&(c[0]&255)==0x89&&c[1]==0x50&&c[2]==0x4e&&c[3]==0x47&&c[4]==0x0d&&c[5]==0x0a&&c[6]==0x1a&&c[7]==0x0a;
            case "image/webp" -> c.length>=12&&c[0]=='R'&&c[1]=='I'&&c[2]=='F'&&c[3]=='F'&&c[8]=='W'&&c[9]=='E'&&c[10]=='B'&&c[11]=='P';
            default -> false;
        };
    }
    private static String hash(Object... parts){try{MessageDigest d=MessageDigest.getInstance("SHA-256");for(Object p:parts)d.update(String.valueOf(p).getBytes(java.nio.charset.StandardCharsets.UTF_8));return HexFormat.of().formatHex(d.digest());}catch(Exception e){throw new IllegalStateException(e);}}
    private static String sha256(byte[] content){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));}catch(Exception e){throw new IllegalStateException(e);}}
    private record StoredAttachmentRecord(String contentType,String filename,byte[] inlineContent,String provider,String objectKey,String checksum){}
    public record ChatMessageSaved(Message message) {}
}
