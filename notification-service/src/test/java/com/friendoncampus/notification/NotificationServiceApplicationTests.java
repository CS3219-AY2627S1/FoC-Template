package com.friendoncampus.notification;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.friendoncampus.notification.reminder.ReminderRepository;
import com.friendoncampus.notification.repository.NotificationRepository;
import com.friendoncampus.notification.repository.ProcessedEventRepository;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration,"
                + "org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration",
        "app.kafka.enabled=false",
        "app.retention.enabled=false",
        "app.reminders.enabled=false"
})
class NotificationServiceApplicationTests {

    @MockitoBean
    private NotificationRepository notificationRepository;

    @MockitoBean
    private ProcessedEventRepository processedEventRepository;

    @MockitoBean
    private ReminderRepository reminderRepository;

    @Test
    void contextLoads() {
    }
}
