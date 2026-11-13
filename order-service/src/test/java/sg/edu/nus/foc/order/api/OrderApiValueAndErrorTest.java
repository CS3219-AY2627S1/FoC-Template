package sg.edu.nus.foc.order.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import sg.edu.nus.foc.order.api.dto.request.CreateOrderRequest;
import sg.edu.nus.foc.order.api.dto.request.ManualRepostRequest;
import sg.edu.nus.foc.order.api.dto.request.OrderActorRequest;
import sg.edu.nus.foc.order.api.dto.request.RepostConfigurationRequest;
import sg.edu.nus.foc.order.api.dto.response.ErrorDetailResponse;
import sg.edu.nus.foc.order.api.dto.response.ErrorResponse;
import sg.edu.nus.foc.order.api.dto.response.RepostDraftResponse;
import sg.edu.nus.foc.order.domain.OrderProblem;

class OrderApiValueAndErrorTest {
    @Test
    void traditionalDtosExposeTheirValues() {
        Instant now = Instant.parse("2026-09-30T00:00:00Z");
        CreateOrderRequest create = new CreateOrderRequest(
                "c", "u", "item", "p", "d", 2, 15, now, true, now, 3, 20, now.plusSeconds(3600));
        assertEquals("c", create.getCommandId());

        OrderActorRequest actor = new OrderActorRequest("a", "u", 1);
        assertEquals(1, actor.getExpectedVersion());

        RepostConfigurationRequest config = new RepostConfigurationRequest(
                "r", "u", 1, true, now, 2, 15);
        assertTrue(config.isEnabled());

        ManualRepostRequest manual = new ManualRepostRequest(
                "m", "u", 1, "item", 2, 15, now);
        assertEquals("item", manual.getItemDescription());

        RepostDraftResponse draft = new RepostDraftResponse(
                "original", "item", "p", "d", 2, 15, now);
        assertEquals("original", draft.getOriginalOrderId());

        ErrorDetailResponse detail = new ErrorDetailResponse("field", "bad");
        ErrorResponse response = new ErrorResponse(
                400,
                "VALIDATION_ERROR",
                "bad",
                "/path",
                now,
                List.of(detail));
        assertEquals(List.of(detail), response.getDetails());
        assertEquals(400, response.getStatus());
        assertEquals("VALIDATION_ERROR", response.getError());
        assertEquals("bad", response.getMessage());
        assertEquals("/path", response.getPath());
        assertEquals(now, response.getTimestamp());
        assertEquals("field", detail.getField());
        assertEquals("bad", detail.getMessage());
    }

    @Test
    void exceptionHandlerMapsCodesAndMalformedRequests() {
        OrderExceptionHandler handler = new OrderExceptionHandler();
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/orders");
        assertEquals(
                404,
                handler.orderProblem(OrderProblem.notFound("missing"), request)
                        .getStatusCode()
                        .value());
        assertEquals(
                401,
                handler.orderProblem(new OrderProblem("UNAUTHENTICATED", "login"), request)
                        .getStatusCode()
                        .value());
        assertEquals(
                403,
                handler.orderProblem(OrderProblem.forbidden("denied"), request)
                        .getStatusCode()
                        .value());
        assertEquals(
                400,
                handler.orderProblem(new OrderProblem("VALIDATION_ERROR", "bad"), request)
                        .getStatusCode()
                        .value());
        assertEquals(
                503,
                handler.orderProblem(new OrderProblem("SERVICE_UNAVAILABLE", "down"), request)
                        .getStatusCode()
                        .value());
        assertEquals(
                409,
                handler.orderProblem(new OrderProblem("CONFLICT", "conflict"), request)
                        .getStatusCode()
                        .value());
        assertEquals(
                400,
                handler.invalid(new IllegalArgumentException("bad"), request)
                        .getStatusCode()
                        .value());
        assertEquals(
                400,
                handler.malformedRequest(
                                new HttpMessageNotReadableException(
                                        "bad",
                                        new MockHttpInputMessage(
                                                new ByteArrayInputStream(new byte[0]))),
                                request)
                        .getStatusCode()
                        .value());
        assertEquals(
                400,
                handler.malformedRequest(
                                new MethodArgumentTypeMismatchException(
                                        "x", String.class, "id", null, null),
                                request)
                        .getStatusCode()
                        .value());
    }

    @Test
    void validationErrorsIncludeFieldDetails() {
        BeanPropertyBindingResult binding = new BeanPropertyBindingResult(
                new Object(),
                "request");
        binding.addError(new FieldError(
                "request",
                "itemDescription",
                "must not be blank"));
        MethodArgumentNotValidException exception = new MethodArgumentNotValidException(
                (MethodParameter) null,
                binding);

        ErrorResponse body = new OrderExceptionHandler()
                .invalidRequest(
                        exception,
                        new MockHttpServletRequest("POST", "/api/orders"))
                .getBody();

        assertNotNull(body);
        assertEquals("itemDescription", body.getDetails().getFirst().getField());
        assertEquals("must not be blank", body.getDetails().getFirst().getMessage());
    }
}
