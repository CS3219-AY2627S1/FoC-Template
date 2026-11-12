package com.campuscouriers.notification_service.notification;

import java.util.UUID;

record NotificationSaved(UUID recipientId, NotificationResponse notification) {}
