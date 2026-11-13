package com.friendoncampus.admin;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/** A lifecycle broker outage must not occupy the existing command delivery scheduler. */
@Configuration
@ConditionalOnProperty(name={"app.kafka.enabled","app.case-events.enabled"},havingValue="true")
public class CaseEventScheduling {
    @Bean(name="taskScheduler") ThreadPoolTaskScheduler commands(){return scheduler("admin-command-");}
    @Bean(name="caseEventScheduler") ThreadPoolTaskScheduler lifecycle(){return scheduler("admin-case-events-");}
    private ThreadPoolTaskScheduler scheduler(String prefix){
        var scheduler=new ThreadPoolTaskScheduler();scheduler.setPoolSize(1);scheduler.setThreadNamePrefix(prefix);return scheduler;
    }
}
