package com.friendoncampus.user.support;
import java.util.*;
import com.friendoncampus.user.service.EmailVerificationMailer;
public class FakeEmailVerificationMailer implements EmailVerificationMailer {
 private final List<Message> messages = new ArrayList<>();
 @Override public void sendVerificationCode(String email, String code) { messages.add(new Message(email, code)); }
 public List<Message> messages() { return List.copyOf(messages); }
 public record Message(String email, String code) { }
}
