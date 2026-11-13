package com.friendoncampus.chat.web.error;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.friendoncampus.chat.domain.UnsupportedChatLanguageException;
import com.friendoncampus.chat.service.ChatAccessException;
import com.friendoncampus.chat.service.ChatConflictException;
import com.friendoncampus.chat.storage.AttachmentStorageException;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ChatAccessException.class)
    ProblemDetail notFound(ChatAccessException exception) {
        ProblemDetail problem=ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND,"Conversation not found");
        problem.setTitle("Conversation not found"); problem.setProperty("code","CHAT_NOT_FOUND"); return problem;
    }

    @ExceptionHandler(ChatConflictException.class)
    ProblemDetail conflict(ChatConflictException exception) {
        ProblemDetail problem=ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,exception.getMessage());
        problem.setTitle("Chat action rejected"); problem.setProperty("code","CHAT_CONFLICT"); return problem;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail invalid(IllegalArgumentException exception) {
        ProblemDetail problem=ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,exception.getMessage());
        problem.setTitle("Invalid chat request"); problem.setProperty("code","INVALID_CHAT_REQUEST"); return problem;
    }

    @ExceptionHandler(UnsupportedChatLanguageException.class)
    ProblemDetail unsupportedLanguage(UnsupportedChatLanguageException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
        problem.setTitle("Unsupported Chat language");
        problem.setProperty("code", "UNSUPPORTED_LANGUAGE");
        return problem;
    }

    @ExceptionHandler(AttachmentStorageException.class)
    ProblemDetail attachmentStorage(AttachmentStorageException exception) {
        LOG.error("Chat attachment storage operation failed", exception);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
                "The image store is temporarily unavailable");
        problem.setTitle("Image unavailable");
        problem.setProperty("code", "CHAT_IMAGE_STORAGE_UNAVAILABLE");
        return problem;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail invalidRequest(MethodArgumentNotValidException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "preferredLanguage is required");
        problem.setTitle("Invalid Chat preference");
        problem.setProperty("code", "INVALID_REQUEST");
        return problem;
    }
}
