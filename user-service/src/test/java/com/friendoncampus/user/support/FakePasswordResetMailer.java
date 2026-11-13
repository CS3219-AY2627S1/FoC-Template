package com.friendoncampus.user.support;

import java.util.ArrayList;
import java.util.List;

import com.friendoncampus.user.service.PasswordResetMailer;

public class FakePasswordResetMailer implements PasswordResetMailer {
    private final List<Message> messages = new ArrayList<>();

    @Override
    public void sendPasswordResetCode(String email, String code) {
        messages.add(new Message(email, code));
    }

    public List<Message> messages() {
        return List.copyOf(messages);
    }

    public record Message(String email, String code) {
    }
}
