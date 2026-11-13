package sg.edu.nus.foc.supplier.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Remembers each user's roles for a short time, so an administrator's page loads and edits don't each call
 * the User Service. Keyed by the verified token's subject (the user ID). Failures are never cached, and
 * role changes in the User Service take effect here within {@code ttl}.
 */
public class CachingRoleProvider implements RoleProvider {

    static final int MAX_ENTRIES = 10_000;

    private final RoleProvider delegate;
    private final Duration ttl;
    private final Clock clock;
    private final ConcurrentMap<String, Entry> cache = new ConcurrentHashMap<>();

    private record Entry(Set<Role> roles, Instant expiresAt) {
    }

    public CachingRoleProvider(RoleProvider delegate, Duration ttl, Clock clock) {
        this.delegate = delegate;
        this.ttl = ttl;
        this.clock = clock;
    }

    @Override
    public Set<Role> rolesFor(Jwt caller) {
        String userId = caller.getSubject();
        Instant now = clock.instant();
        Entry cached = userId != null ? cache.get(userId) : null;
        if (cached != null && now.isBefore(cached.expiresAt())) {
            return cached.roles();
        }
        Set<Role> roles = Set.copyOf(delegate.rolesFor(caller));
        if (userId != null) {
            if (cache.size() >= MAX_ENTRIES) {
                cache.values().removeIf(entry -> !now.isBefore(entry.expiresAt()));
            }
            if (cache.size() < MAX_ENTRIES) {
                cache.put(userId, new Entry(roles, now.plus(ttl)));
            }
        }
        return roles;
    }

    /** Security decisions must not reuse a positive role after account deactivation. */
    public Set<Role> currentRolesFor(Jwt caller) {
        return Set.copyOf(delegate.rolesFor(caller));
    }
}
