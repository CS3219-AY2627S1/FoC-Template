package com.friendoncampus.credit.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.friendoncampus.credit.service.CreditAccountNotFoundException;

@RestControllerAdvice
public class CreditExceptionHandler {

    @ExceptionHandler(CreditAccountNotFoundException.class)
    ProblemDetail accountNotFound(CreditAccountNotFoundException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.getMessage());
        problem.setTitle("Credit account not found");
        return problem;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail invalidQuery(IllegalArgumentException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
        problem.setTitle("Invalid credit query");
        return problem;
    }
}
