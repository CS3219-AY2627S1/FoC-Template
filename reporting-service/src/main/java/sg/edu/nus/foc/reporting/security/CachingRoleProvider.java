/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.security.oauth2.jwt.Jwt;

class CachingRoleProvider implements RoleProvider {
    private final RoleProvider delegate; private final Duration ttl; private final Clock clock;
    private final ConcurrentHashMap<String, Entry> cache = new ConcurrentHashMap<>();
    private record Entry(Set<Role> roles, Instant expiresAt) { }
    CachingRoleProvider(RoleProvider delegate, Duration ttl, Clock clock) { this.delegate = delegate; this.ttl = ttl; this.clock = clock; }
    @Override public Set<Role> rolesFor(Jwt caller) {
        Instant now = clock.instant(); Entry entry = cache.get(caller.getSubject());
        if (entry != null && now.isBefore(entry.expiresAt())) return entry.roles();
        Set<Role> roles = Set.copyOf(delegate.rolesFor(caller));
        if (cache.size() > 10_000) cache.clear();
        cache.put(caller.getSubject(), new Entry(roles, now.plus(ttl)));
        return roles;
    }
}
