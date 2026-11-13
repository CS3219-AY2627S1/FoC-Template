package com.friendoncampus.admin;

import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class EvidenceAttachmentController {
    private final CaseService cases;private final ServiceTokens tokens;private final URI chat;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).followRedirects(HttpClient.Redirect.NEVER).build();
    public EvidenceAttachmentController(CaseService cases,ServiceTokens tokens,@Value("${app.chat.base-url}")URI chat){this.cases=cases;this.tokens=tokens;this.chat=chat;}
    @GetMapping("/api/admin/cases/{caseId}/messages/{messageId}/attachment")
    public ResponseEntity<byte[]> image(@AuthenticationPrincipal Jwt actor,@PathVariable UUID caseId,@PathVariable UUID messageId){
        cases.evidenceCase(actor,caseId);
        try {
            var request=java.net.http.HttpRequest.newBuilder(chat.resolve("/internal/chat/cases/"+caseId+"/messages/"+messageId+"/attachment"))
                .timeout(Duration.ofSeconds(8)).header("Authorization","Bearer "+tokens.issue("chat-service")).header("X-Actor-Token",actor.getTokenValue()).GET().build();
            var result=http.send(request,HttpResponse.BodyHandlers.ofByteArray());
            if(result.statusCode()!=200)throw new ResponseStatusException(HttpStatus.valueOf(Set.of(401,403,404).contains(result.statusCode())?result.statusCode():503),"Image unavailable.");
            String type=result.headers().firstValue("Content-Type").orElse("");
            if(!Set.of("image/png","image/jpeg","image/webp").contains(type)||result.body().length==0||result.body().length>5242880)throw new IllegalArgumentException();
            cases.evidenceCase(actor,caseId);
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType(type)).header("X-Content-Type-Options","nosniff").body(result.body());
        }catch(ResponseStatusException e){throw e;}catch(Exception e){if(e instanceof InterruptedException)Thread.currentThread().interrupt();throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Image unavailable. Try again.");}
    }
}
