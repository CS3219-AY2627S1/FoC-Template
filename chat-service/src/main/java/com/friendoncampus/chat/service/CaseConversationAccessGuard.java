package com.friendoncampus.chat.service;

import java.time.Clock;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

/** Actor-specific denial never turns the entire conversation into a terminal state. */
@Service
public class CaseConversationAccessGuard {
    private final JdbcClient db;
    private final InternalServiceClient internal;
    public CaseConversationAccessGuard(JdbcClient db,Clock clock,InternalServiceClient internal){this.db=db;this.internal=internal;}
    public JsonNode access(UUID id,UUID actor) {
        var row=db.sql("SELECT case_id,case_participant_id,order_id FROM chat_conversations WHERE id=:id AND conversation_type='CASE'")
                .param("id",id).query((rs,n)->new Case(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getObject(3,UUID.class))).optional().orElse(null);
        if(row==null)return null;
        JsonNode access=internal.caseAccess(row.caseId,actor,row.participant);
        if(!row.caseId.toString().equals(access.path("caseId").asText())||!row.order.toString().equals(access.path("orderId").asText())
                ||!access.path("canReadConversation").isBoolean()||!access.path("canWriteConversation").isBoolean()
                ||!access.path("canReadConversation").asBoolean())throw new ChatAccessException();
        return access;
    }
    public boolean requireRead(UUID id,UUID actor){return access(id,actor)!=null;}
    public boolean refresh(UUID id,UUID actor){JsonNode a=access(id,actor);return a==null||a.path("canWriteConversation").asBoolean();}
    private record Case(UUID caseId,UUID participant,UUID order){}
}