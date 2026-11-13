package com.friendoncampus.chat.service;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.friendoncampus.chat.domain.ChatLanguage;
import com.friendoncampus.chat.domain.QuickReplyKey;

@Component
public class QuickReplyCatalog {

    private final Map<ChatLanguage, Map<QuickReplyKey, String>> translations;

    public QuickReplyCatalog() {
        translations = Map.of(
                ChatLanguage.EN, replies("I'm on my way.", "I've arrived.", "I'm running 5 minutes late.",
                        "Where should we meet?", "Thank you!"),
                ChatLanguage.ZH, replies("我正在路上。", "我到了。", "我会迟到5分钟。", "我们应该在哪里见面？", "谢谢！"),
                ChatLanguage.MS, replies("Saya sedang dalam perjalanan.", "Saya sudah sampai.",
                        "Saya akan lewat 5 minit.", "Kita patut berjumpa di mana?", "Terima kasih!"),
                ChatLanguage.TA, replies("நான் வந்துகொண்டிருக்கிறேன்.", "நான் வந்துவிட்டேன்.",
                        "நான் 5 நிமிடம் தாமதமாக வருவேன்.", "நாம் எங்கே சந்திக்கலாம்?", "நன்றி!"));
    }

    public List<QuickReply> list(ChatLanguage language) {
        return translations.get(language).entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> new QuickReply(entry.getKey(), language, entry.getValue()))
                .toList();
    }

    public String resolve(ChatLanguage language, QuickReplyKey key) {
        return translations.get(language).get(key);
    }

    private static Map<QuickReplyKey, String> replies(String onMyWay, String arrived, String late,
            String whereMeet, String thanks) {
        EnumMap<QuickReplyKey, String> replies = new EnumMap<>(QuickReplyKey.class);
        replies.put(QuickReplyKey.ON_MY_WAY, onMyWay);
        replies.put(QuickReplyKey.ARRIVED, arrived);
        replies.put(QuickReplyKey.RUNNING_LATE_5, late);
        replies.put(QuickReplyKey.WHERE_MEET, whereMeet);
        replies.put(QuickReplyKey.THANK_YOU, thanks);
        return Map.copyOf(replies);
    }

    public record QuickReply(QuickReplyKey key, ChatLanguage language, String text) {
    }
}
