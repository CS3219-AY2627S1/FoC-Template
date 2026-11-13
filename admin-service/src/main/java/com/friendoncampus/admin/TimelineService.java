package com.friendoncampus.admin;

import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;

@Service
public class TimelineService {
    private final CaseService cases;
    private final ChatTimelineClient chat;
    private final UserEligibilityClient users;
    private final ReviewerIndependenceService independence;
    public TimelineService(CaseService cases,ChatTimelineClient chat,UserEligibilityClient users,ReviewerIndependenceService independence){this.cases=cases;this.chat=chat;this.users=users;this.independence=independence;}
    public JsonNode read(Jwt actor,UUID caseId,String cursor,int limit){
        if(limit<1||limit>100||cursor!=null&&(cursor.isBlank()||cursor.length()>4096))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Timeline limit must be 1–100 and the cursor must be valid.");
        var summary=cases.evidenceCase(actor,caseId); // Fresh effective role/account check; no transaction spans HTTP.
        final JsonNode timeline;
        try { timeline=chat.fetch(caseId,summary.orderId(),actor.getTokenValue(),cursor,limit); }
        catch(RuntimeException ex) { if(cursor==null)independence.invalidate(caseId); throw ex; }
        // Do not disclose a remote result if the actor was revoked while it was being fetched.
        var current=users.find(UUID.fromString(actor.getSubject()));
        if(!current.active()||!current.administrator())throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Current administrator access is required.");
        if(cursor==null)try { independence.remember(caseId,summary.orderId(),timeline); }
        catch(ResponseStatusException ex) {
            if(ex.getStatusCode()!=HttpStatus.SERVICE_UNAVAILABLE)throw ex;
            // Evidence remains readable when incomplete/stale; it grants no reviewer writes.
        }
        return timeline;
    }
}
