package sg.edu.nus.foc.order.domain.repository;

public interface UserDeletionGuard {
    void requireAllowed(String... userIds);

    boolean prepare(String userId, String operationId);
}
