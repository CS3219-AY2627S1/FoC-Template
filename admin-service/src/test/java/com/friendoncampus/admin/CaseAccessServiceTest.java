package com.friendoncampus.admin;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class CaseAccessServiceTest {
    final UUID id = UUID.randomUUID(), order = UUID.randomUUID(), reviewer = UUID.randomUUID(), participant = UUID.randomUUID(), other = UUID.randomUUID();
    final AdminCaseRepository cases = mock(AdminCaseRepository.class);
    final UserEligibilityClient users = mock(UserEligibilityClient.class);
    final ReviewerIndependenceService independence = mock(ReviewerIndependenceService.class);
    final CaseAccessService service = new CaseAccessService(cases, users, independence);
    void setup(AdminCase.State state, UUID actor, boolean active, boolean admin) {
        AdminCase c = mock(AdminCase.class);
        when(c.getOrderId()).thenReturn(order); when(c.getReviewerId()).thenReturn(reviewer); when(c.getState()).thenReturn(state);
        when(c.getParticipants()).thenReturn(Set.of(participant, other)); when(cases.findWithParticipantsById(id)).thenReturn(Optional.of(c));
        when(users.find(actor)).thenReturn(new UserEligibilityClient.Eligibility(actor, active, admin));
        when(independence.independent(id, order, actor)).thenReturn(true);
    }
    @Test void isolatesParticipantFromEvidenceAndOtherConversation() {
        setup(AdminCase.State.UNDER_REVIEW, participant, true, false);
        var result = service.check(id, participant, participant);
        assertFalse(result.canReadEvidence()); assertTrue(result.canReadConversation()); assertTrue(result.canWriteConversation());
        assertEquals(List.of(participant), result.allowedParticipantIds());
        assertThrows(ResponseStatusException.class, () -> service.check(id, participant, other));
    }
    @Test void onlyReviewerAdminWritesAndResolvedIsReadOnly() {
        setup(AdminCase.State.UNDER_REVIEW, reviewer, true, true);
        assertTrue(service.check(id, reviewer, participant).canWriteConversation());
        setup(AdminCase.State.UNDER_REVIEW, other, true, true);
        // An administrator who is a participant may write their own conversation, but not another participant's.
        assertFalse(service.check(id, other, participant).canWriteConversation());
        assertTrue(service.check(id, other, participant).canReadEvidence());
        setup(AdminCase.State.RESOLVED, reviewer, true, true);
        assertFalse(service.check(id, reviewer, participant).canWriteConversation());
    }
    @Test void deniesInactiveAndUnrelatedAndMissingCase() {
        setup(AdminCase.State.OPEN, reviewer, false, true);
        assertThrows(ResponseStatusException.class, () -> service.check(id, reviewer, participant));
        setup(AdminCase.State.OPEN, reviewer, true, false);
        assertThrows(ResponseStatusException.class, () -> service.check(id, reviewer, participant));
        when(cases.findWithParticipantsById(id)).thenReturn(Optional.empty());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class, () -> service.check(id, reviewer, participant)).getStatusCode());
    }
    @Test void propagatesEligibilityOutageRatherThanGrantingAccess() {
        setup(AdminCase.State.UNDER_REVIEW, reviewer, true, true);
        when(users.find(reviewer)).thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, assertThrows(ResponseStatusException.class, () -> service.check(id, reviewer, participant)).getStatusCode());
    }
    @Test void involvedOrUnverifiableReviewerCannotWriteEvenTheirOwnConversation() {
        for(boolean unavailable:List.of(false,true)) {
            setup(AdminCase.State.UNDER_REVIEW,reviewer,true,true);
            when(cases.findWithParticipantsById(id).orElseThrow().getParticipants()).thenReturn(Set.of(reviewer,participant));
            if(unavailable)when(independence.independent(id,order,reviewer)).thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
            else when(independence.independent(id,order,reviewer)).thenReturn(false);
            assertFalse(service.check(id,reviewer,participant).canWriteConversation());
            assertFalse(service.check(id,reviewer,reviewer).canWriteConversation());
            assertTrue(service.check(id,reviewer,participant).canReadConversation());
        }
        verify(independence,times(6)).independent(id,order,reviewer);
    }
    @Test void observesResolutionCommittedWhileEligibilityWasBeingChecked() {
        setup(AdminCase.State.UNDER_REVIEW, reviewer, true, true);
        AdminCase resolved = mock(AdminCase.class);
        when(resolved.getOrderId()).thenReturn(order);
        when(resolved.getReviewerId()).thenReturn(reviewer);
        when(resolved.getState()).thenReturn(AdminCase.State.RESOLVED);
        when(resolved.getParticipants()).thenReturn(Set.of(participant, other));
        when(users.find(reviewer)).thenAnswer(call -> {
            when(cases.findWithParticipantsById(id)).thenReturn(Optional.of(resolved));
            return new UserEligibilityClient.Eligibility(reviewer, true, true);
        });
        assertFalse(service.check(id, reviewer, participant).canWriteConversation());
    }
}
