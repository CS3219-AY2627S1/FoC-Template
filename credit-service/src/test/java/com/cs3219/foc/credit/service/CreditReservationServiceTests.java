package com.cs3219.foc.credit.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.cs3219.foc.credit.model.dto.CreditReservationResponse;
import com.cs3219.foc.credit.model.dto.ReserveCreditRequest;
import com.cs3219.foc.credit.repository.CreditAccountRepository;
import com.cs3219.foc.credit.repository.CreditReservationRepository;
import com.cs3219.foc.credit.security.CurrentUserService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

class CreditReservationServiceTests {
    @Test
    void reserveUsesAuthenticatedId() {
        var currentUserService = mock(CurrentUserService.class);
        var service = spy(new CreditReservationService(
                mock(CreditAccountRepository.class),
                mock(CreditReservationRepository.class),
                mock(ApplicationEventPublisher.class),
                currentUserService));
        var userId = UUID.randomUUID();
        var request = new ReserveCreditRequest(UUID.randomUUID(), UUID.randomUUID(), 80);
        var response = new CreditReservationResponse("RESERVED");
        when(currentUserService.requireCurrentUserId()).thenReturn(userId);
        doReturn(response).when(service).reserve(userId, request);

        assertThat(service.reserve(request)).isEqualTo(response);
        verify(service).reserve(userId, request);
    }
}
