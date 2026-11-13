package sg.edu.nus.foc.user.repository;

import java.util.List;
import java.util.Optional;

import sg.edu.nus.foc.user.model.AccountStatus;
import sg.edu.nus.foc.user.model.User;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface UserRepository extends MongoRepository<User, String> {
    Optional<User> findByUserId(String userId);
    Optional<User> findFirstByRolesContaining(String role);
    Optional<User> findFirstByEmailAndStatus(String email, AccountStatus status);
    List<User> findByStatus(AccountStatus status);

    long countByRolesContaining(String role);
    long countByRolesContainingAndStatus(String role, AccountStatus status);
}