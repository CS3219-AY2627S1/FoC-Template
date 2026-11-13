package com.friendoncampus.user.web;

import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@RestController
public class AdminOperationController {
    private final ObjectProvider<JdbcTemplate> databases;
    public AdminOperationController(ObjectProvider<JdbcTemplate> databases){this.databases=databases;}
    @GetMapping("/internal/users/admin-operations/{operationId}")
    public ResponseEntity<JsonNode> read(@PathVariable UUID operationId,@AuthenticationPrincipal Jwt caller){
        if(!"chat-service".equals(caller.getSubject()))throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        var db=databases.getIfAvailable();if(db==null)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"User operation storage unavailable");
        try{
            var rows=db.queryForList("SELECT payload FROM user_sanction_operations WHERE operation_id=?",String.class,operationId);
            if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Operation not found");
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(JsonMapper.builder().build().readTree(rows.get(0)));
        }catch(org.springframework.dao.DataAccessException ex){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"User operation storage unavailable");}
    }
}
