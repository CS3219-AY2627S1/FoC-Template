package com.friendoncampus.admin;

import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
public class ChatTimelineClient {
    private final URI base;
    private final ServiceTokens tokens;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).followRedirects(HttpClient.Redirect.NEVER).build();
    private final JsonMapper json=JsonMapper.builder().build();
    public ChatTimelineClient(@Value("${app.chat.base-url}") URI base,ServiceTokens tokens){
        if(base.getHost()==null||!java.util.Set.of("http","https").contains(base.getScheme())) throw new IllegalArgumentException("Chat URL must be HTTP(S)");
        this.base=base;this.tokens=tokens;
    }
    public JsonNode fetch(UUID caseId,UUID orderId,String actorToken,String cursor,int limit){
        try {
            var uri=base.resolve("/internal/chat/cases/"+caseId+"/timeline?limit="+limit+(cursor==null?"":"&cursor="+URLEncoder.encode(cursor,StandardCharsets.UTF_8)));
            var request=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(3)).header("Authorization","Bearer "+tokens.issue("chat-service"))
                    .header("X-Actor-Token",actorToken).header("Accept","application/json").GET().build();
            var response=http.send(request,HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()==409) throw new ResponseStatusException(HttpStatus.CONFLICT,"The evidence snapshot is no longer available. Restart the timeline.");
            if(response.statusCode()!=200) throw new IllegalArgumentException();
            var result=json.readTree(response.body()); EvidenceValidation.timeline(result,caseId,orderId);
            EvidenceValidation.require(result.path("records").size()<=limit);
            return EvidenceValidation.publicTimeline(result);
        } catch(ResponseStatusException ex){throw ex;}
        catch(Exception ex){
            if(ex instanceof InterruptedException)Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"The evidence timeline is temporarily unavailable. No completeness claim can be made. Try again.");
        }
    }
}
