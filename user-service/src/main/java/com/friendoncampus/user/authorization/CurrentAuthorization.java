package com.friendoncampus.user.authorization;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import com.friendoncampus.user.domain.*;
import com.friendoncampus.user.repository.UserRepository;

@Component
public class CurrentAuthorization {
    private final UserRepository users;
    public CurrentAuthorization(UserRepository users) { this.users=users; }
    public void require(Jwt jwt) {
        if(jwt.getExpiresAt()==null || !jwt.getExpiresAt().isAfter(Instant.now()))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"A valid token is required");
        final User user;
        try { user=users.findById(UUID.fromString(jwt.getSubject())).orElse(null); }
        catch(org.springframework.dao.DataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Current account authorization unavailable");
        }
        if(user==null || user.getStatus()!=UserStatus.ACTIVE
                || !user.hasRole(UserRole.valueOf(jwt.getClaimAsString("role"))))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Current account permission is required");
    }
}
