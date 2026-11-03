package sg.edu.nus.foc.user.logic;

import java.time.Instant;
import java.util.regex.Pattern;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import sg.edu.nus.foc.user.model.User;

@Service
public class AdminUserDirectory {
    private final MongoTemplate mongo;
    private final UserLifecycleStore lifecycle;

    public AdminUserDirectory(MongoTemplate mongo, UserLifecycleStore lifecycle) { 
        this.mongo = mongo; 
        this.lifecycle = lifecycle;
    }

    public AdminUserPage search(int page, int size, String searchBy, String q) {
        if (page < 1 || size < 1 || size > 100)
            throw invalid("page must be at least 1 and size must be between 1 and 100.");
        if (!"id".equals(searchBy) && !"name".equals(searchBy))
            throw invalid("searchBy must be id or name.");
        String value = q == null ? "" : q.strip();
        if (value.length() > 128) throw invalid("q must not exceed 128 characters.");

        lifecycle.clearAllExpiredSuspensions(Instant.now());

        Query filter = new Query();
        if (!value.isEmpty()) {
            filter.addCriteria("id".equals(searchBy) ? Criteria.where("userId").is(value)
                    : Criteria.where("username").regex(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE)));
        }
        long total = mongo.count(filter, User.class);
        Query paged = Query.of(filter).with(Sort.by("username", "userId", "id"))
                .skip(((long) page - 1) * size).limit(size);
        // Fetch only display fields, leaving deletion/recovery metadata inside the owning service.
        paged.fields().include("id", "userId", "username", "email", "roles", "penalty",
                "isCourierSuspended", "suspensionEndDate", "status");
        return new AdminUserPage(mongo.find(paged, User.class).stream().map(AdminUserPage.Item::from).toList(),
                page, size, total, total / size + (total % size == 0 ? 0 : 1));
    }

    private ResponseStatusException invalid(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
