package sg.edu.nus.foc.user.security;

import java.util.EnumSet;
import java.util.Set;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import sg.edu.nus.foc.user.model.AccountStatus;
import sg.edu.nus.foc.user.model.User;
import sg.edu.nus.foc.user.repository.UserRepository;

@Component
public class MongoUserServiceRoleProvider implements RoleProvider {

    private final UserRepository userRepository;

    public MongoUserServiceRoleProvider(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public Set<Role> rolesFor(Jwt caller) {
        String firebaseUid = caller.getSubject();

        return userRepository.findByUserId(firebaseUid)
                .filter(user ->
                        user.getStatus() == AccountStatus.ACTIVE)
                .map(user -> {
                    Set<Role> roles = EnumSet.noneOf(Role.class);

                    if (user.getRoles() != null) {
                        user.getRoles().stream()
                                .map(Role::fromId)
                                .flatMap(java.util.Optional::stream)
                                .forEach(roles::add);
                    }

                    return Set.copyOf(roles);
                })
                .orElseGet(Set::of);
    }
}