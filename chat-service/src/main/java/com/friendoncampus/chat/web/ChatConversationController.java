package com.friendoncampus.chat.web;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.multipart.MultipartFile;

import com.friendoncampus.chat.service.ChatConversationService;
import com.friendoncampus.chat.service.ChatConversationService.Attachment;
import com.friendoncampus.chat.service.ChatConversationService.Conversation;
import com.friendoncampus.chat.service.ChatConversationService.Message;
import com.friendoncampus.chat.translation.ChatTranslationService;
import com.friendoncampus.chat.translation.ChatTranslationService.Translation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;

@RestController
@RequestMapping("/api/chat")
public class ChatConversationController {
    private final ChatConversationService chats;
    private final ChatTranslationService translations;
    public ChatConversationController(ChatConversationService chats,ChatTranslationService translations){this.chats=chats;this.translations=translations;}
    @GetMapping("/orders/{orderId}/conversation") Conversation order(@PathVariable UUID orderId,@AuthenticationPrincipal Jwt jwt){return chats.byOrder(orderId,actor(jwt));}
    @GetMapping("/conversations/{id}") Conversation conversation(@PathVariable UUID id,@AuthenticationPrincipal Jwt jwt){return chats.get(id,actor(jwt));}
    @GetMapping("/conversations/{id}/messages") List<Message> messages(@PathVariable UUID id,@RequestParam(defaultValue="0") long after,@RequestParam(defaultValue="50") int limit,@AuthenticationPrincipal Jwt jwt){return chats.messages(id,actor(jwt),after,limit);}
    @PostMapping("/conversations/{id}/messages") Message send(@PathVariable UUID id,@Valid @RequestBody SendMessage request,@AuthenticationPrincipal Jwt jwt){return "IMAGE".equals(request.messageType())?chats.sendImage(id,actor(jwt),request.clientMessageId(),request.attachmentId()):chats.sendText(id,actor(jwt),request.clientMessageId(),request.messageType(),request.text(),request.quickReplyKey());}
    @PostMapping(path="/conversations/{id}/attachments",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) Attachment upload(@PathVariable UUID id,@RequestPart("file") MultipartFile file,@AuthenticationPrincipal Jwt jwt){return chats.upload(id,actor(jwt),file);}
    @GetMapping("/conversations/{id}/attachments/{attachmentId}") ResponseEntity<byte[]> download(@PathVariable UUID id,@PathVariable UUID attachmentId,@AuthenticationPrincipal Jwt jwt){var a=chats.attachment(id,attachmentId,actor(jwt));return ResponseEntity.ok().contentType(MediaType.parseMediaType(a.contentType())).header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.inline().filename(a.filename(),StandardCharsets.UTF_8).build().toString()).body(a.content());}
    @PostMapping("/conversations/{id}/messages/{messageId}/translations") @ResponseStatus(HttpStatus.ACCEPTED) Translation translate(@PathVariable UUID id,@PathVariable UUID messageId,@Valid @RequestBody TranslationRequest request,@AuthenticationPrincipal Jwt jwt){return translations.request(id,messageId,actor(jwt),request.targetLanguage());}
    @GetMapping("/conversations/{id}/messages/{messageId}/translations/{language}") Translation translation(@PathVariable UUID id,@PathVariable UUID messageId,@PathVariable String language,@AuthenticationPrincipal Jwt jwt){return translations.get(id,messageId,actor(jwt),language);}
    private static UUID actor(Jwt jwt){return UUID.fromString(jwt.getSubject());}
    public record SendMessage(@NotNull UUID clientMessageId,String messageType,String text,String quickReplyKey,UUID attachmentId){}
    public record TranslationRequest(@NotBlank String targetLanguage){}
}
