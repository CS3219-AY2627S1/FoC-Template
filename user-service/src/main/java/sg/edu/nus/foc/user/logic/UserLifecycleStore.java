package sg.edu.nus.foc.user.logic;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import sg.edu.nus.foc.user.model.AccountStatus;
import sg.edu.nus.foc.user.model.User;

/** Single-document conditional writes. Never replace a stale copy of lifecycle fields. */
@Component
public class UserLifecycleStore {
    private final MongoTemplate mongo;

    public UserLifecycleStore(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    public User begin(String uid) {
        User pending = mongo.findAndModify(Query.query(Criteria.where("userId").is(uid)
                        .and("status").is(AccountStatus.ACTIVE)),
                new Update().set("status", AccountStatus.DEACTIVATION_PENDING)
                        .set("deletionOperationId", UUID.randomUUID().toString()).set("deletionCanRestore", true),
                FindAndModifyOptions.options().returnNew(true), User.class);
        if (pending == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "Account state changed; reload before deleting.");
        return pending;
    }

    public User attachLegacyOperation(String uid) {
        // Old pending records may already have deleted Firebase. Never reactivate them on a denial.
        User pending = mongo.findAndModify(Query.query(Criteria.where("userId").is(uid)
                        .and("status").is(AccountStatus.DEACTIVATION_PENDING).and("deletionOperationId").is(null)),
                new Update().set("deletionOperationId", UUID.randomUUID().toString()).set("deletionCanRestore", false),
                FindAndModifyOptions.options().returnNew(true), User.class);
        return pending != null ? pending : mongo.findOne(Query.query(Criteria.where("userId").is(uid)), User.class);
    }

    public boolean restoreAfterDenial(User pending) {
        return mongo.updateFirst(owned(pending).addCriteria(Criteria.where("deletionCanRestore").is(true)),
                new Update().set("status", AccountStatus.ACTIVE).unset("deletionOperationId")
                        .unset("deletionCanRestore"), User.class).getModifiedCount() == 1;
    }

    public boolean seal(User pending) {
        return mongo.updateFirst(owned(pending), new Update().set("deletionCanRestore", false), User.class)
                .getMatchedCount() == 1;
    }

    public void complete(User pending) {
        mongo.updateFirst(owned(pending), new Update().set("status", AccountStatus.DEACTIVATED)
                .set("deletionCanRestore", false), User.class);
    }

    public User saveActive(User user) {
        User saved = mongo.findAndModify(Query.query(Criteria.where("userId").is(user.getUserId())
                        .and("status").is(AccountStatus.ACTIVE)),
                new Update().set("username", user.getUsername()).set("email", user.getEmail())
                        .set("roles", user.getRoles()).set("penalty", user.getPenalty())
                        .set("isCourierSuspended", user.getIsCourierSuspended())
                        .set("suspensionEndDate", user.getSuspensionEndDate()),
                FindAndModifyOptions.options().returnNew(true), User.class);
        if (saved == null) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account is not active.");
        return saved;
    }

    public User clearExpiredSuspension(String uid, Instant now) {
        User updated = mongo.findAndModify(
                Query.query(
                        Criteria.where("userId").is(uid)
                                .and("status").is(AccountStatus.ACTIVE)
                                .and("isCourierSuspended").is(true)
                                .and("isPermanentlySuspended").ne(true)
                                .and("suspensionEndDate").lte(now)
                ),
                new Update()
                        .set("isCourierSuspended", false)
                        .unset("suspensionEndDate"),
                FindAndModifyOptions.options().returnNew(true),
                User.class
        );

        return updated;
    }

    public void clearAllExpiredSuspensions(Instant now) {
        Query expiredSuspensions = new Query(
                Criteria.where("status").is(AccountStatus.ACTIVE)
                        .and("isCourierSuspended").is(true)
                        .and("isPermanentlySuspended").ne(true)
                        .and("suspensionEndDate").lte(now)
        );

        Update update = new Update()
                .set("isCourierSuspended", false)
                .unset("suspensionEndDate");

        mongo.updateMulti(expiredSuspensions, update, User.class);
    }

    private Query owned(User pending) {
        if (pending.getDeletionOperationId() == null) throw new IllegalArgumentException("Deletion operation is required.");
        return Query.query(Criteria.where("userId").is(pending.getUserId())
                .and("status").is(AccountStatus.DEACTIVATION_PENDING)
                .and("deletionOperationId").is(pending.getDeletionOperationId()));
    }
}
