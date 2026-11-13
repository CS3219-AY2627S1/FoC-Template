package com.friendoncampus.admin;

import org.springframework.http.*;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Controller
class AdminSpaController {
    @GetMapping({"/admin", "/admin/{*path}"})
    String frontend() { return "forward:/admin-assets/index.html"; }
}

@RestControllerAdvice
class ApiProblems {
    @ExceptionHandler({org.springframework.dao.DataAccessException.class, org.springframework.transaction.TransactionException.class})
    ResponseEntity<ProblemDetail> unavailable(Exception ex) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).cacheControl(CacheControl.noStore()).body(
                ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Case storage is temporarily unavailable. Retry with the same request key if a submission is pending."));
    }
    @ExceptionHandler({org.springframework.web.bind.MethodArgumentNotValidException.class,
            org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
            org.springframework.web.bind.MissingRequestHeaderException.class,
            org.springframework.web.bind.MissingServletRequestParameterException.class,
            org.springframework.http.converter.HttpMessageNotReadableException.class})
    ResponseEntity<ProblemDetail> invalid(Exception ex) {
        return ResponseEntity.badRequest().cacheControl(CacheControl.noStore()).body(
                ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Check the request fields, UUID identifiers and Idempotency-Key header."));
    }
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ProblemDetail> status(ResponseStatusException ex) {
        ProblemDetail p = ProblemDetail.forStatusAndDetail(ex.getStatusCode(), ex.getReason() == null ? "Request failed" : ex.getReason());
        return ResponseEntity.status(ex.getStatusCode()).cacheControl(CacheControl.noStore()).body(p);
    }
}
