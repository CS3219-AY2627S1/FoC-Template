package sg.edu.nus.foc.user.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import lombok.RequiredArgsConstructor;

import sg.edu.nus.foc.user.event.PenaltyEventConsumer;
import sg.edu.nus.foc.user.dto.PubSubPushRequest;

@RestController
@RequestMapping("/api/users/internal/penalties")
@RequiredArgsConstructor
public class PenaltyEventController {

    private final PenaltyEventConsumer penaltyEventConsumer;

    @Operation(summary = "Durably receive a sequenced courier penalty or reward",
            description = "Version2 events are stored before acknowledgment and applied per courier sequence. Gaps remain pending for recovery. Legacy addition/deduction routes are drain-only.")
    @ApiResponse(responseCode = "200", description = "Event durably received, including an identical retry; score application may await earlier events")
    @ApiResponse(responseCode = "400", description = "Invalid payload, policy, version, sequence or subscription")
    @ApiResponse(responseCode = "401", description = "Authenticated Pub/Sub identity required")
    @ApiResponse(responseCode = "409", description = "Event identity or courier sequence conflicts")
    @PostMapping("/events")
    public ResponseEntity<Void> receiveEvent(@RequestBody PubSubPushRequest request) {
        penaltyEventConsumer.consume(request);
        return ResponseEntity.ok().build();
    }

    // POST /api/users/internal/penalties/addition
    @Operation(summary = "Add to a courier's penalty")
    @PostMapping("/addition")
    public ResponseEntity<Void> receiveAddition(
            @RequestBody PubSubPushRequest request
    ) {

        penaltyEventConsumer.consumeAddition(request);

        return ResponseEntity.ok().build();
    }

    // POST /api/users/internal/penalties/deduction
    @Operation(summary = "Deduct from a courier's penalty")
    @PostMapping("/deduction")
    public ResponseEntity<Void> receiveDeduction(
            @RequestBody PubSubPushRequest request
    ) {

        penaltyEventConsumer.consumeDeduction(request);

        return ResponseEntity.ok().build();
    }
}
