package com.friendoncampus.admin;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import static com.friendoncampus.admin.CaseViews.*;

@Service
public class CaseService {
    private final JdbcTemplate db;
    private com.friendoncampus.admin.dispute.DisputeBus disputes;
    @org.springframework.beans.factory.annotation.Autowired public void disputes(com.friendoncampus.admin.dispute.DisputeBus bus){this.disputes=bus;}
    private final UserEligibilityClient users;
    private final ChatEligibilityClient chat;
    private final ChatConversationClient conversations;
    private final CreditActionService creditActions;
    private final ReviewerIndependenceService independence;
    private final TransactionTemplate transaction;
    private final JsonMapper json = JsonMapper.builder().build();
    private static final String CASE_COLUMNS = "id, order_id, state, reviewer_id, revision, created_at, correlation_id, source_sequence, review_status";

    public CaseService(JdbcTemplate db, UserEligibilityClient users, ChatEligibilityClient chat, ChatConversationClient conversations, CreditActionService creditActions, PlatformTransactionManager manager, ReviewerIndependenceService independence) {
        this.db = db; this.users = users; this.chat = chat;
        this.conversations = conversations;
        this.creditActions = creditActions;
        this.independence = independence;
        transaction = new TransactionTemplate(manager);
        transaction.setTimeout(15);
    }

    public Mutation report(Jwt jwt, UUID key, UUID orderId, String description) {
        UUID actor=requireParticipant(jwt);
        String text=description==null?"":description.strip();
        if(key==null||orderId==null||text.isEmpty()||text.length()>2000)throw invalid("An errand UUID and an issue of 1–2000 characters are required.");
        String route="/api/admin/reports",hash=hash(List.of(orderId.toString(),text));
        return mutate(key,actor,route,hash,()->{
            lock("order:"+orderId);
            var rows=db.query("SELECT "+CASE_COLUMNS+" FROM admin_cases WHERE order_id=? FOR UPDATE",this::caseRow,orderId);
            UUID caseId=rows.isEmpty()?UUID.nameUUIDFromBytes(("foc-dispute:"+orderId).getBytes(StandardCharsets.UTF_8)):rows.get(0).summary.caseId();
            if(!rows.isEmpty()&&isMember(caseId,actor)&&(rows.get(0).summary.state()==AdminCase.State.RESOLVED||closure(caseId)!=null||hasStatement(caseId,actor)))return problem(409,"This case is closed, closing, or already contains your statement.",route);
            if(Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM admin_report_preparations WHERE case_id=? AND actor_id=? AND status='PENDING')",Boolean.class,caseId,actor)))return problem(409,"Resume your pending report before sending another.",route);
            if(rows.isEmpty())db.update("INSERT INTO admin_cases(id,order_id,state,revision,source_sequence,created_at,correlation_id,review_status) VALUES (?,?,'OPEN',0,0,?,?,'PREPARING')",caseId,orderId,timestamp(Instant.now()),UUID.randomUUID());
            db.update("INSERT INTO admin_report_preparations(operation_id,actor_id,order_id,case_id,request_hash,description,actor_role) VALUES (?,?,?,?,?,?,?)",key,actor,orderId,caseId,hash,text,jwt.getClaimAsString("role"));
            var m=new com.friendoncampus.admin.dispute.DisputeBus.Message(key,1,"PrepareReview","admin-service",key,caseId,orderId,actor,jwt.getClaimAsString("role"),Instant.now(),json.valueToTree(Map.of("intent","REPORT")));
            disputes.remember(m,"REQUEST");disputes.emit("admin.dispute.commands","PrepareReview",m,m.data(),true);
            return result(202,new ParticipantReport(new Summary(caseId,orderId,AdminCase.State.OPEN,null,0,Instant.now(),"PREPARING"),null,new Preparation(key,"PENDING",null)));
        });
    }

    // Owner confirmations and this local receipt/event commit in the inbox worker transaction.
    public void completeReport(com.friendoncampus.admin.dispute.DisputeBus.Message m) {
        lock("order:"+m.orderId());
        var c=row(m.caseId());
        if(c.summary.state()==AdminCase.State.RESOLVED||closure(m.caseId())!=null)throw invalid("Case is already closing.");
        var preparation=db.queryForMap("SELECT * FROM admin_report_preparations WHERE operation_id=? FOR UPDATE",m.operationId());
        if("READY".equals(preparation.get("status")))return;
        if(hasStatement(m.caseId(),m.actorId()))throw invalid("Statement already exists.");
        var participants=m.data().path("participants");
        boolean member=false;for(var person:participants){UUID id=UUID.fromString(person.asText());member|=id.equals(m.actorId());db.update("INSERT INTO admin_case_participants(case_id,user_id) VALUES (?,?) ON CONFLICT DO NOTHING",m.caseId(),id);}
        if(!member)throw invalid("Reporter was not confirmed by Order.");
        boolean opened=c.sourceSequence==0;Instant now=Instant.now();
        db.update("UPDATE admin_cases SET review_status='READY',revision=revision+1,source_sequence=source_sequence+? WHERE id=?",opened?1:0,m.caseId());
        db.update("INSERT INTO admin_statements(case_id,reporter_id,description,submitted_at,eligibility_revision) VALUES (?,?,?,?,?)",m.caseId(),m.actorId(),preparation.get("description"),timestamp(now),"ORDER_CONFIRMATION:"+m.eventId());
        var saved=row(m.caseId());audit(saved,m.actorId(),opened?"CASE_OPENED":"STATEMENT_ADDED",now);
        if(opened)event(saved,m.actorId(),m.actorRole(),"CaseOpened","reporterId",m.actorId(),now);
        db.update("UPDATE admin_report_preparations SET status='READY' WHERE operation_id=?",m.operationId());
        db.update("UPDATE admin_mutation_receipts SET response_status=201,response_body=? WHERE idempotency_key=?",json.writeValueAsString(new ParticipantReport(saved.summary,statement(m.caseId(),m.actorId()))),m.operationId());
    }
    public Mutation claim(Jwt jwt, UUID key, UUID caseId, long expectedRevision) {
        UUID actor = requireAdmin(jwt);
        if (expectedRevision < 0) throw invalid("Revision must be non-negative.");
        var initial = row(caseId).summary;
        if(!"READY".equals(initial.reviewStatus()))return mutate(key,actor,"/api/admin/cases/"+caseId+"/claim",hash(List.of(expectedRevision)),()->{
            db.update("UPDATE admin_cases SET review_status='PREPARING' WHERE id=? AND review_status<>'READY'",caseId);
            var m=new com.friendoncampus.admin.dispute.DisputeBus.Message(key,1,"PrepareReview","admin-service",key,caseId,initial.orderId(),actor,"ADMIN",Instant.now(),json.valueToTree(Map.of("intent","LEGACY")));
            disputes.remember(m,"REQUEST");disputes.emit("admin.dispute.commands","PrepareReview",m,m.data(),true);
            return result(202,row(caseId).summary);
        });
        independence.verify(jwt, caseId, initial.orderId());
        requireAdmin(jwt);
        String route = "/api/admin/cases/" + caseId + "/claim";
        String hash = hash(List.of(expectedRevision));
        return mutate(key, actor, route, hash, () -> {
            List<CaseRow> rows = db.query("SELECT " + CASE_COLUMNS + " FROM admin_cases WHERE id=? FOR UPDATE", this::caseRow, caseId);
            if (rows.isEmpty()) return problem(404, "Case not found.", route);
            CaseRow c = rows.get(0);
            independence.require(caseId, c.summary.orderId(), actor);
            if (c.summary.revision() != expectedRevision) return problem(409, "This case has changed. Refresh it before claiming.", route);
            if (c.summary.state() != AdminCase.State.OPEN) return problem(409, "This case has already been claimed or resolved.", route);
            db.update("UPDATE admin_cases SET state='UNDER_REVIEW',reviewer_id=?,revision=revision+1,source_sequence=source_sequence+1 WHERE id=?", actor, caseId);
            CaseRow saved = row(caseId);
            Instant now = Instant.now();
            audit(saved, actor, "CASE_CLAIMED", now);
            event(saved, actor, "ADMIN", "CaseClaimed", "reviewerId", actor, now);
            return result(200, saved.summary);
        });
    }

    public ParticipantReport reportStatus(Jwt jwt, UUID caseId) {
        UUID actor = requireParticipant(jwt);
        // Durable verified case membership grants private status, even before a statement.
        if (!isMember(caseId, actor)) {
            var pending=preparation(caseId,actor);if(pending==null)throw hidden();
            var saved=db.queryForMap("SELECT order_id,created_at FROM admin_report_preparations WHERE operation_id=?",pending.operationId());
            var safe=new Summary(caseId,(UUID)saved.get("order_id"),AdminCase.State.OPEN,null,0,db.queryForObject("SELECT created_at FROM admin_report_preparations WHERE operation_id=?",OffsetDateTime.class,pending.operationId()).toInstant(),"PREPARING");
            return new ParticipantReport(safe,null,pending);
        }
        return new ParticipantReport(row(caseId).summary, hasStatement(caseId, actor) ? statement(caseId, actor) : null,preparation(caseId,actor));
    }

    private Preparation preparation(UUID id,UUID actor){return db.query("SELECT operation_id,status,failure_code FROM admin_report_preparations WHERE case_id=? AND actor_id=? ORDER BY created_at DESC LIMIT 1",r->r.next()?new Preparation(r.getObject(1,UUID.class),r.getString(2),r.getString(3)):null,id,actor);}
    public record ReportContext(UUID orderId,String status,UUID caseId,AdminCase.State state) { }
    public ReportContext reportContext(Jwt jwt,UUID orderId) {
        UUID actor=requireParticipant(jwt);
        // Return existing private statement status locally; verify other participants with Chat.
        var own=db.query("SELECT c.id,c.state FROM admin_cases c JOIN admin_statements s ON s.case_id=c.id WHERE c.order_id=? AND s.reporter_id=?",
            (r,n)->new ReportContext(orderId,"OWN_REPORT",r.getObject("id",UUID.class),AdminCase.State.valueOf(r.getString("state"))),orderId,actor);
        if(!own.isEmpty())return own.get(0); // Existing private status does not depend on Chat.
        var pending=db.query("SELECT case_id FROM admin_report_preparations WHERE order_id=? AND actor_id=? AND status='PENDING'",r->r.next()?new ReportContext(orderId,"PREPARING_REVIEW",r.getObject(1,UUID.class),AdminCase.State.OPEN):null,orderId,actor);
        if(pending!=null)return pending;
        var membership=db.query("SELECT c.id,c.state FROM admin_cases c JOIN admin_case_participants p ON p.case_id=c.id WHERE c.order_id=? AND p.user_id=?",
            (r,n)->new ReportContext(orderId,"CASE_PARTICIPANT",r.getObject("id",UUID.class),AdminCase.State.valueOf(r.getString("state"))),orderId,actor);
        if(!membership.isEmpty())return membership.get(0); // Already verified membership survives evidence outages.
        // This permits saving a request, not access to an errand or an eligibility decision.
        // Order verifies membership when it consumes the command; no remote write/read is needed here.
        return new ReportContext(orderId,"REPORT_REQUEST_AVAILABLE",null,null);
    }

    public Page queue(Jwt jwt, AdminCase.State state, UUID query, int page, int size) {
        requireAdmin(jwt);
        if (page < 0 || size < 1 || size > 100) throw invalid("Page must be non-negative and size must be between 1 and 100.");
        String where = " WHERE 1=1";
        List<Object> args = new ArrayList<>();
        if (state != null) { where += " AND state=?"; args.add(state.name()); }
        if (query != null) { where += " AND (id=? OR order_id=?)"; args.add(query); args.add(query); }
        Long count = db.queryForObject("SELECT count(*) FROM admin_cases" + where, Long.class, args.toArray());
        args.add(size); args.add((long)page * size);
        List<Summary> content = db.query("SELECT " + CASE_COLUMNS + " FROM admin_cases" + where + " ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                (r,n) -> caseRow(r,n).summary, args.toArray());
        long total = count == null ? 0 : count;
        return new Page(content, page, size, total, (int)Math.min(Integer.MAX_VALUE, (total + size - 1) / size));
    }

    public Detail detail(Jwt jwt, UUID caseId) {
        requireAdmin(jwt);
        // A repeatable local read keeps summary/revision and statements from the same snapshot.
        TransactionTemplate read = new TransactionTemplate(transaction.getTransactionManager());
        read.setReadOnly(true);
        read.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_REPEATABLE_READ);
        return read.execute(s -> localDetail(caseId));
    }
    Detail localDetail(UUID caseId) {
        return new Detail(row(caseId).summary,
                db.query("SELECT reporter_id,description,submitted_at FROM admin_statements WHERE case_id=? ORDER BY submitted_at,reporter_id", this::statementRow, caseId), creditActions.list(caseId),
                db.query("SELECT resolution FROM admin_case_decisions WHERE case_id=?",r->r.next()?r.getString(1):null,caseId),closure(caseId));
    }
    private Closure closure(UUID caseId){
        return db.query("SELECT operation_id,resolution,case_revision,explanations,credit_disposition FROM admin_resolution_preparations WHERE case_id=?",r->{
            if(!r.next())return null;List<ResolutionService.Explanation> explanations=new ArrayList<>();
            json.readTree(r.getString("explanations")).properties().forEach(e->explanations.add(new ResolutionService.Explanation(UUID.fromString(e.getKey()),e.getValue().asText())));
            return new Closure(r.getObject("operation_id",UUID.class),r.getString("resolution"),r.getLong("case_revision"),explanations,r.getString("credit_disposition"));
        },caseId);
    }
    public Summary evidenceCase(Jwt jwt,UUID caseId) {
        requireAdmin(jwt);
        return row(caseId).summary;
    }

    public List<ChatConversationClient.Conversation> confirmedConversations(Jwt jwt, UUID caseId, boolean participantView) {
        UUID actor = participantView ? requireParticipant(jwt) : requireAdmin(jwt);
        if (participantView && !isMember(caseId, actor)) throw hidden();
        var summary=row(caseId).summary;
        List<ChatConversationClient.Conversation> result=new ArrayList<>(db.query("""
                SELECT r.conversation_id,r.participant_user_id,c.order_id,c.state,c.reviewer_id,c.closure_operation_id
                FROM admin_case_conversations r JOIN admin_cases c ON c.id=r.case_id
                WHERE r.case_id=?
                """ + (participantView ? " AND r.participant_user_id=?" : "") + " ORDER BY r.participant_user_id",
                (r,n) -> new ChatConversationClient.Conversation(r.getObject("conversation_id",UUID.class), caseId,
                        r.getObject("order_id",UUID.class), r.getObject("participant_user_id",UUID.class),
                        r.getObject("closure_operation_id")!=null || !"UNDER_REVIEW".equals(r.getString("state")) || (!participantView && !actor.equals(r.getObject("reviewer_id",UUID.class)))),
                participantView ? new Object[]{caseId,actor} : new Object[]{caseId}));
        // Missing local confirmation is recovered through Chat's authorized READ, never a creation POST.
        var targets=participantView?List.of(actor):db.queryForList("SELECT user_id FROM admin_case_participants WHERE case_id=? ORDER BY user_id",UUID.class,caseId);
        for(UUID target:targets)if(result.stream().noneMatch(r->target.equals(r.participantUserId())))
            conversations.find(caseId,summary.orderId(),target,jwt.getTokenValue()).ifPresent(result::add);
        if(participantView)requireParticipant(jwt);else requireAdmin(jwt);
        return List.copyOf(result);
    }

    public Mutation openConversation(Jwt jwt, UUID key, UUID caseId, UUID participantId) {
        UUID actor = requireAdmin(jwt);
        if (participantId == null || key == null) throw invalid("A participant and Idempotency-Key UUID are required.");
        var initial = row(caseId).summary;
        if (!actor.equals(initial.reviewerId())) throw forbidden("Only the assigned reviewer can initiate a conversation.");
        independence.verify(jwt, caseId, initial.orderId());
        requireAdmin(jwt);
        conversationCase(actor, caseId, participantId);
        String route = "/api/admin/cases/" + caseId + "/conversations";
        String fingerprint = hash(List.of(participantId.toString()));
        // Reserve global operation identity in a short transaction. 503 is provisional, not proof
        // that Chat did not commit. Parallel/restarted retries delegate the identical key to Chat.
        var reserved = mutate(key, actor, route, fingerprint,
                () -> problem(503, "Conversation initiation is unconfirmed. Retry with the same request key.", route));
        if (reserved.status() != 503) return reserved;
        var reference = conversations.open(caseId, initial.orderId(), participantId, key, jwt.getTokenValue());
        requireAdmin(jwt); // Revocation while Chat was responding must prevent disclosure.
        try {
            return transaction.execute(s -> {
                db.execute("SET LOCAL lock_timeout='5s'");
                lock("request:" + key);
                db.query("SELECT id FROM admin_cases WHERE id=? FOR UPDATE", r -> null, caseId);
                conversationCase(actor, caseId, participantId);
                independence.require(caseId, initial.orderId(), actor);
                var previous = receipt(key, actor, route, fingerprint);
                if (previous != null && previous.status() != 503) return previous;
                var known = db.queryForList("SELECT conversation_id FROM admin_case_conversations WHERE case_id=? AND participant_user_id=?", UUID.class, caseId, participantId);
                if (!known.isEmpty() && !known.get(0).equals(reference.conversationId())) throw unavailable("Chat returned a conflicting conversation reference. Retry with the same request key.");
                if (known.isEmpty()) {
                    db.update("INSERT INTO admin_case_conversations(case_id,participant_user_id,conversation_id) VALUES (?,?,?)", caseId, participantId, reference.conversationId());
                    db.update("UPDATE admin_cases SET revision=revision+1 WHERE id=?", caseId);
                    audit(row(caseId), actor, "CONVERSATION_OPENED", Instant.now());
                }
                var result = result(200, reference);
                db.update("UPDATE admin_mutation_receipts SET response_status=200,response_body=? WHERE idempotency_key=?", result.body(), key);
                return result;
            });
        } catch (DataAccessException | org.springframework.transaction.TransactionException ex) {
            throw unavailable("Conversation confirmation could not be saved. Retry with the same request key.");
        }
    }
    private Summary conversationCase(UUID actor, UUID caseId, UUID participantId) {
        var summary = row(caseId).summary;
        if (!actor.equals(summary.reviewerId())) throw forbidden("Only the assigned reviewer can initiate a conversation.");
        if (summary.state() != AdminCase.State.UNDER_REVIEW) throw new ResponseStatusException(HttpStatus.CONFLICT, "This case is not open for conversation initiation.");
        if(closure(caseId)!=null)throw new ResponseStatusException(HttpStatus.CONFLICT,"Resolution preparation is pending; no new conversations can be initiated.");
        if (!isMember(caseId, participantId)) throw hidden();
        return summary;
    }

    private UUID requireParticipant(Jwt jwt) {
        if (!Set.of("REQUESTER", "COURIER").contains(jwt.getClaimAsString("role"))) throw forbidden("Select Requester or Courier mode to access participant reports.");
        UUID actor = UUID.fromString(jwt.getSubject());
        if (!users.find(actor).active()) throw forbidden("An active verified account is required.");
        return actor;
    }
    private UUID requireAdmin(Jwt jwt) {
        if (!"ADMIN".equals(jwt.getClaimAsString("role"))) throw forbidden("Select Admin mode to review cases.");
        UUID actor = UUID.fromString(jwt.getSubject());
        var eligibility = users.find(actor);
        if (!eligibility.active() || !eligibility.administrator()) throw forbidden("An active administrator account is required.");
        return actor;
    }

    private Mutation mutate(UUID key, UUID actor, String route, String hash, Supplier<Mutation> operation) {
        if (key == null) throw invalid("An Idempotency-Key UUID is required.");
        try {
            return transaction.execute(status -> {
                db.execute("SET LOCAL lock_timeout='5s'");
                lock("request:" + key);
                Mutation previous = receipt(key, actor, route, hash);
                if (previous != null) return previous;
                Mutation outcome = operation.get();
                db.update("INSERT INTO admin_mutation_receipts(idempotency_key,actor_id,route,request_hash,response_status,response_body) VALUES (?,?,?,?,?,?)",
                        key, actor, route, hash, outcome.status(), outcome.body());
                return outcome;
            });
        } catch (DataAccessException | org.springframework.transaction.TransactionException ex) { throw unavailable("The case could not be saved. Retry using the same request key."); }
    }
    private Mutation receipt(UUID key, UUID actor, String route, String hash) {
        if (key == null) throw invalid("An Idempotency-Key UUID is required.");
        return db.query("SELECT actor_id,route,request_hash,response_status,response_body FROM admin_mutation_receipts WHERE idempotency_key=?", r -> {
            if (!r.next()) return null;
            if (!actor.equals(r.getObject("actor_id", UUID.class)) || !route.equals(r.getString("route")) || !hash.equals(r.getString("request_hash")))
                return problem(409, "This request key was already used for a different request.", route);
            return new Mutation(r.getInt("response_status"), r.getString("response_body"));
        }, key);
    }
    private void lock(String identity) {
        // Database-scoped transaction locks serialize missing-row creation and receipt races across replicas.
        db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", r -> null, identity);
    }
    private boolean isMember(UUID c, UUID actor) {
        return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM admin_case_participants WHERE case_id=? AND user_id=?)", Boolean.class, c, actor));
    }
    private boolean hasStatement(UUID c, UUID actor) {
        return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM admin_statements WHERE case_id=? AND reporter_id=?)", Boolean.class, c, actor));
    }
    private CaseRow row(UUID id) {
        var rows = db.query("SELECT " + CASE_COLUMNS + " FROM admin_cases WHERE id=?", this::caseRow, id);
        if (rows.isEmpty()) throw hidden();
        return rows.get(0);
    }
    private CaseRow caseRow(ResultSet r, int n) throws SQLException {
        return new CaseRow(new Summary(r.getObject("id", UUID.class), r.getObject("order_id", UUID.class), AdminCase.State.valueOf(r.getString("state")),
                r.getObject("reviewer_id", UUID.class), r.getLong("revision"), r.getObject("created_at", OffsetDateTime.class).toInstant(),r.getString("review_status")),
                r.getObject("correlation_id", UUID.class), r.getLong("source_sequence"));
    }
    private Statement statement(UUID c, UUID actor) {
        var rows = db.query("SELECT reporter_id,description,submitted_at FROM admin_statements WHERE case_id=? AND reporter_id=?", this::statementRow, c, actor);
        if (rows.isEmpty()) throw hidden();
        return rows.get(0);
    }
    private Statement statementRow(ResultSet r, int n) throws SQLException {
        return new Statement(r.getObject("reporter_id", UUID.class), r.getString("description"), r.getObject("submitted_at", OffsetDateTime.class).toInstant());
    }
    private void audit(CaseRow c, UUID actor, String action, Instant time) {
        db.update("INSERT INTO admin_case_audit(id,case_id,case_revision,actor_id,action,occurred_at) VALUES (?,?,?,?,?,?)",
                UUID.randomUUID(), c.summary.caseId(), c.summary.revision(), actor, action, timestamp(time));
    }
    private void event(CaseRow c, UUID actor, String role, String type, String participantField, UUID participant, Instant time) {
        UUID eventId = UUID.randomUUID();
        Map<String,Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", eventId); envelope.put("eventType", type); envelope.put("eventVersion", 1);
        envelope.put("aggregateType", "AdminCase"); envelope.put("aggregateId", c.summary.caseId()); envelope.put("aggregateVersion", c.summary.revision());
        envelope.put("occurredAt", time); envelope.put("producer", "admin-service"); envelope.put("correlationId", c.correlationId); envelope.put("causationId", null);
        envelope.put("actor", Map.of("type", "USER", "userId", actor, "role", role));
        envelope.put("data", Map.of("caseId", c.summary.caseId(), "orderId", c.summary.orderId(), "sourceSequence", c.sourceSequence, participantField, participant));
        db.update("INSERT INTO admin_case_outbox(event_id,case_id,source_sequence,event_type,topic,payload,created_at) VALUES (?,?,?,?,?,?,?)",
                eventId, c.summary.caseId(), c.sourceSequence, type, "admin.events", json.writeValueAsString(envelope), timestamp(time));
    }
    private String hash(Object input) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsString(input).getBytes(StandardCharsets.UTF_8))); }
        catch (Exception ex) { throw new IllegalStateException("Unable to fingerprint request", ex); }
    }
    private Mutation result(int status, Object body) { return new Mutation(status, json.writeValueAsString(body)); }
    private Mutation problem(int status, String detail, String route) {
        return result(status, Map.of("type", "about:blank", "title", HttpStatus.valueOf(status).getReasonPhrase(), "status", status, "detail", detail, "instance", route));
    }
    private static OffsetDateTime timestamp(Instant time) { return time.atOffset(ZoneOffset.UTC); }
    private static ResponseStatusException invalid(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException forbidden(String message) { return new ResponseStatusException(HttpStatus.FORBIDDEN, message); }
    private static ResponseStatusException unavailable(String message) { return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, message); }
    private static ResponseStatusException hidden() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found."); }
    private record CaseRow(Summary summary, UUID correlationId, long sourceSequence) { }
}
