package sg.edu.nus.foc.user.logic;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.junit.jupiter.api.*;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.MongoDBContainer;
import sg.edu.nus.foc.user.model.AccountStatus;
import sg.edu.nus.foc.user.model.User;

class AdminUserDirectoryTest {
    // Match the pinned Mongo image used by Order's CI-compatible User integration fixture.
    private static final MongoDBContainer DATABASE = new MongoDBContainer("mongo:7.0.43");
    private static MongoClient client;
    private static MongoTemplate mongo;
    private static UserLifecycleStore lifecycle;
    private AdminUserDirectory directory;

    @BeforeAll static void database() {
        DATABASE.start();
        client = MongoClients.create(DATABASE.getReplicaSetUrl());
        mongo = new MongoTemplate(client, "directory_test");
    }
    @AfterAll static void close() {
        if (client != null) client.close();
        DATABASE.stop();
    }
    @BeforeEach void reset() {
        mongo.dropCollection(User.class);
        lifecycle = new UserLifecycleStore(mongo);
        directory = new AdminUserDirectory(mongo, lifecycle);
    }

    @Test void initialPageIsBoundedAndIncludesAllStatusesWithStableTieOrdering() {
        for (int i = 22; i >= 0; i--) {
            User user = user(String.format("uid-%02d", i), "Alex");
            user.setStatus(i == 22 ? AccountStatus.DEACTIVATED : AccountStatus.ACTIVE);
            mongo.save(user);
        }
        AdminUserPage first = directory.search(1, 20, "id", "");
        AdminUserPage second = directory.search(2, 20, "id", "");
        assertEquals(23, first.totalItems()); assertEquals(2, first.totalPages());
        assertEquals(20, first.items().size()); assertEquals("uid-00", first.items().getFirst().userId());
        assertEquals("uid-19", first.items().getLast().userId());
        assertEquals(3, second.items().size()); assertEquals("uid-20", second.items().getFirst().userId());
        assertEquals(AccountStatus.DEACTIVATED, second.items().getLast().status());
        AdminUserPage beyond = directory.search(3, 20, "name", "");
        assertTrue(beyond.items().isEmpty()); assertEquals(23, beyond.totalItems());
    }

    @Test void nameSearchIsTrimmedCaseInsensitiveLiteralAndFilteredBeforeTotalsAndPaging() {
        mongo.insert(List.of(user("a", "Alex Lee"), user("b", "ALEX Tan"), user("c", "Sam"), user("d", "A.* literal")), User.class);
        AdminUserPage result = directory.search(2, 1, "name", " alex ");
        assertEquals(2, result.totalItems()); assertEquals(2, result.totalPages());
        assertEquals("Alex Lee", result.items().getFirst().username());
        AdminUserPage literal = directory.search(1, 20, "name", "A.*");
        assertEquals(1, literal.totalItems()); assertEquals("d", literal.items().getFirst().userId());
    }

    @Test void idMatchesOnlyExactFirebaseIdAndEmptyResultsRemainAValidPage() {
        User user = user("firebase-1", "Alex"); user.setId("mongo-document"); mongo.save(user);
        assertEquals("firebase-1", directory.search(1, 20, "id", " firebase-1 ").items().getFirst().userId());
        for (String value : List.of("firebase", "mongo-document", "FIREBASE-1")) {
            AdminUserPage empty = directory.search(1, 20, "id", value);
            assertTrue(empty.items().isEmpty()); assertEquals(0, empty.totalPages()); assertEquals(0, empty.totalItems());
        }
        assertTrue(directory.search(2, 20, "id", "firebase-1").items().isEmpty());
        assertEquals(1, directory.search(2, 20, "id", "firebase-1").totalItems());
    }

    @Test void invalidInputIsRejectedAndMaximumPageSizeWorks() {
        for (int[] values : List.of(new int[] {0, 20}, new int[] {1, 0}, new int[] {1, 101}))
            assertEquals(400, assertThrows(ResponseStatusException.class,
                    () -> directory.search(values[0], values[1], "id", "")).getStatusCode().value());
        assertThrows(ResponseStatusException.class, () -> directory.search(1, 20, "email", "x"));
        assertThrows(ResponseStatusException.class, () -> directory.search(1, 20, "id", "x".repeat(129)));
        assertEquals(100, directory.search(1, 100, "id", "").size());
        assertTrue(directory.search(Integer.MAX_VALUE, 100, "name", "").items().isEmpty());
    }

    private static User user(String id, String name) {
        User user = new User(); user.setUserId(id); user.setUsername(name); user.setEmail(id + "@u.nus.edu");
        user.setRoles(List.of("requester", "courier")); return user;
    }
}
