package com.friendoncampus.admin;

import static org.junit.jupiter.api.Assertions.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@SpringBootTest
@Testcontainers(disabledWithoutDocker = true)
class AdminPersistenceTest {
    @Container static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine");
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", postgres::getJdbcUrl); r.add("spring.datasource.username", postgres::getUsername);
        r.add("spring.datasource.password", postgres::getPassword);
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired AdminCaseRepository cases;
    @Test void migratesAndLoadsPrivateCaseMembershipAndEnforcesOneCasePerOrder() {
        UUID id = UUID.randomUUID(), order = UUID.randomUUID(), participant = UUID.randomUUID();
        jdbc.update("insert into admin_cases(id,order_id,state,revision) values (?,?,'OPEN',0)", id, order);
        jdbc.update("insert into admin_case_participants(case_id,user_id) values (?,?)", id, participant);
        var c = cases.findWithParticipantsById(id).orElseThrow();
        assertEquals(order, c.getOrderId()); assertTrue(c.getParticipants().contains(participant));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("insert into admin_cases(id,order_id,state,revision) values (?,?,'OPEN',0)", UUID.randomUUID(), order));
    }
}
