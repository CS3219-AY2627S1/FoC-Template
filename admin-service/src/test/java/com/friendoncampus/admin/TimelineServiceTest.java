package com.friendoncampus.admin;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static com.friendoncampus.admin.EvidenceFixtures.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

class TimelineServiceTest {
    final CaseService cases=mock(CaseService.class);final ChatTimelineClient chat=mock(ChatTimelineClient.class);final UserEligibilityClient users=mock(UserEligibilityClient.class);
    final ReviewerIndependenceService independence=mock(ReviewerIndependenceService.class);
    final TimelineService service=new TimelineService(cases,chat,users,independence);
    final Jwt actor=Jwt.withTokenValue("user-token").header("alg","RS256").subject(ACTOR.toString()).claim("role","ADMIN").build();
    void allow(){when(cases.evidenceCase(actor,CASE)).thenReturn(new CaseViews.Summary(CASE,ORDER,AdminCase.State.OPEN,null,1,Instant.now()));when(users.find(ACTOR)).thenReturn(new UserEligibilityClient.Eligibility(ACTOR,true,true));when(chat.fetch(any(),any(),any(),isNull(),eq(20))).thenReturn(JsonMapper.builder().build().valueToTree(timeline()));}
    @Test void authorizationBeforeChatAndRevocationAfterRemoteRead(){allow();assertNotNull(service.read(actor,CASE,null,20));verify(chat).fetch(CASE,ORDER,"user-token",null,20);
        when(users.find(ACTOR)).thenReturn(new UserEligibilityClient.Eligibility(ACTOR,true,false));assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->service.read(actor,CASE,null,20)).getStatusCode());}
    @Test void deniedActorAndInvalidPagingNeverReachChat(){when(cases.evidenceCase(actor,CASE)).thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN));assertThrows(ResponseStatusException.class,()->service.read(actor,CASE,null,20));assertThrows(ResponseStatusException.class,()->service.read(actor,CASE,"",20));assertThrows(ResponseStatusException.class,()->service.read(actor,CASE,null,101));verifyNoInteractions(chat);}
}
