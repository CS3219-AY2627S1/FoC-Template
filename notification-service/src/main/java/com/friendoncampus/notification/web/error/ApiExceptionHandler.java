package com.friendoncampus.notification.web.error;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import com.friendoncampus.notification.service.InvalidNotificationQueryException;
import com.friendoncampus.notification.service.NotificationNotFoundException;

/** RFC-7807 {@code application/problem+json} errors, in the shape Order Service uses. */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(InvalidNotificationQueryException.class)
    public ProblemDetail handleInvalidQuery(InvalidNotificationQueryException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
        problem.setTitle("Invalid notification query");
        problem.setProperty("code", "INVALID_QUERY");
        return problem;
    }

    /** A path ID that is not a UUID. */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ProblemDetail handleInvalidId(MethodArgumentTypeMismatchException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "'" + exception.getValue() + "' is not a valid notification ID");
        problem.setTitle("Invalid notification ID");
        problem.setProperty("code", "INVALID_ID");
        return problem;
    }

    @ExceptionHandler(NotificationNotFoundException.class)
    public ProblemDetail handleNotFound(NotificationNotFoundException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.getMessage());
        problem.setTitle("Notification not found");
        problem.setProperty("code", "NOTIFICATION_NOT_FOUND");
        return problem;
    }
}
