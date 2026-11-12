package com.campuscouriers.credit.event;

import com.campuscouriers.credit.service.ReservationService;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class ErrandExpiredListener {

    private final ReservationService reservationService;

    public ErrandExpiredListener(ReservationService reservationService) {
        this.reservationService = reservationService;
    }

    @KafkaListener(
            topics = ErrandExpiredEvent.TYPE,
            groupId = "credit-service",
            containerFactory = "errandExpiredKafkaListenerContainerFactory"
    )
    public void onErrandExpired(ErrandExpiredEvent event) {
        reservationService.releaseExpiredErrand(event.errandId());
    }
}
