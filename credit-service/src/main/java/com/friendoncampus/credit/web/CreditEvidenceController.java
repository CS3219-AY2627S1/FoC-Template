package com.friendoncampus.credit.web;

import java.util.UUID;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.friendoncampus.credit.service.CreditEvidenceExportService;

@RestController
public class CreditEvidenceController {
    private final ObjectProvider<JdbcClient> databases;

    public CreditEvidenceController(ObjectProvider<JdbcClient> databases) {
        this.databases = databases;
    }
    @GetMapping("/internal/credits/admin-operations/{operationId}")
    public ResponseEntity<tools.jackson.databind.JsonNode> operation(@PathVariable UUID operationId) {
        JdbcClient db=databases.getIfAvailable();
        if(db==null)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Credit evidence storage is unavailable");
        try{
        String payload=db.sql("SELECT payload FROM credit_admin_operations WHERE operation_id=:id").param("id",operationId)
                .query(String.class).optional().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Operation not found"));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(tools.jackson.databind.json.JsonMapper.builder().build().readTree(payload));
        }catch(org.springframework.dao.DataAccessException ex){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Credit operation storage unavailable");}
    }

    @GetMapping("/internal/credits/orders/{orderId}/evidence")
    public ResponseEntity<CreditEvidenceExportService.Export> evidence(
            @PathVariable UUID orderId,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "100") int limit) {
        JdbcClient database = databases.getIfAvailable();
        if (database == null) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "Credit evidence storage is unavailable");
        }
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new CreditEvidenceExportService(database).read(orderId, cursor, limit));
    }
}
