package sg.edu.nus.foc.supplier.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.EnumSet;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

class CachingRoleProviderTest {

    /** Answers with the queued results in order and counts the calls. */
    private static final class ScriptedProvider implements RoleProvider {
        final Deque<Object> answers = new ArrayDeque<>();
        int calls;

        @Override
        @SuppressWarnings("unchecked")
        public Set<Role> rolesFor(Jwt caller) {
            calls++;
            Object next = answers.removeFirst();
            if (next instanceof RuntimeException e) {
                throw e;
            }
            return (Set<Role>) next;
        }
    }

    private static final class MutableClock extends Clock {
        Instant now = Instant.parse("2026-10-10T00:00:00Z");

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private static Jwt token(String uid) {
        Jwt.Builder builder = Jwt.withTokenValue("token-" + uid).header("alg", "none").claim("email", "x@u.nus.edu");
        if (uid != null) {
            builder.subject(uid);
        }
        return builder.build();
    }

    @Test
    void reusesRolesWithinTheTtlAndAsksAgainAfterIt() {
        ScriptedProvider delegate = new ScriptedProvider();
        delegate.answers.add(EnumSet.of(Role.ADMIN));
        delegate.answers.add(EnumSet.of(Role.REQUESTER));
        MutableClock clock = new MutableClock();
        CachingRoleProvider cache = new CachingRoleProvider(delegate, Duration.ofSeconds(30), clock);

        assertThat(cache.rolesFor(token("u1"))).containsExactly(Role.ADMIN);
        clock.now = clock.now.plusSeconds(29);
        assertThat(cache.rolesFor(token("u1"))).containsExactly(Role.ADMIN);
        assertThat(delegate.calls).isEqualTo(1);

        clock.now = clock.now.plusSeconds(1);
        assertThat(cache.rolesFor(token("u1"))).containsExactly(Role.REQUESTER);
        assertThat(delegate.calls).isEqualTo(2);
    }

    @Test
    void cachesPerUserAndNeverCachesFailures() {
        ScriptedProvider delegate = new ScriptedProvider();
        delegate.answers.add(new RoleLookupException("down", null));
        delegate.answers.add(EnumSet.of(Role.COURIER));
        delegate.answers.add(EnumSet.noneOf(Role.class));
        CachingRoleProvider cache = new CachingRoleProvider(delegate, Duration.ofSeconds(30), new MutableClock());

        assertThatThrownBy(() -> cache.rolesFor(token("u1"))).isInstanceOf(RoleLookupException.class);
        assertThat(cache.rolesFor(token("u1"))).containsExactly(Role.COURIER);
        assertThat(cache.rolesFor(token("u2"))).isEmpty();
        assertThat(cache.rolesFor(token("u1"))).containsExactly(Role.COURIER);
        assertThat(delegate.calls).isEqualTo(3);
    }

    @Test
    void tokensWithoutASubjectAreNeverCached() {
        ScriptedProvider delegate = new ScriptedProvider();
        delegate.answers.add(EnumSet.of(Role.ADMIN));
        delegate.answers.add(EnumSet.of(Role.ADMIN));
        CachingRoleProvider cache = new CachingRoleProvider(delegate, Duration.ofSeconds(30), new MutableClock());

        cache.rolesFor(token(null));
        cache.rolesFor(token(null));
        assertThat(delegate.calls).isEqualTo(2);
    }

    @Test
    void staysBoundedByEvictingExpiredEntries() {
        ScriptedProvider delegate = new ScriptedProvider();
        MutableClock clock = new MutableClock();
        CachingRoleProvider cache = new CachingRoleProvider(delegate, Duration.ofSeconds(30), clock);
        for (int i = 0; i < CachingRoleProvider.MAX_ENTRIES; i++) {
            delegate.answers.add(EnumSet.of(Role.REQUESTER));
            cache.rolesFor(token("u" + i));
        }
        // Full and nothing has expired: a new user is answered but not remembered.
        delegate.answers.add(EnumSet.of(Role.ADMIN));
        delegate.answers.add(EnumSet.of(Role.ADMIN));
        cache.rolesFor(token("late"));
        cache.rolesFor(token("late"));
        assertThat(delegate.calls).isEqualTo(CachingRoleProvider.MAX_ENTRIES + 2);

        // Once the old entries expire they are swept, and the next user is remembered again.
        clock.now = clock.now.plusSeconds(31);
        delegate.answers.add(EnumSet.of(Role.ADMIN));
        cache.rolesFor(token("later"));
        cache.rolesFor(token("later"));
        assertThat(delegate.calls).isEqualTo(CachingRoleProvider.MAX_ENTRIES + 3);
    }

    @Test
    void callerRolesAsksTheProviderOnlyForTokenCallers() {
        ScriptedProvider delegate = new ScriptedProvider();
        delegate.answers.add(EnumSet.of(Role.ADMIN));
        delegate.answers.add(EnumSet.of(Role.REQUESTER));
        CallerRoles callerRoles = new CallerRoles(delegate);

        assertThat(callerRoles.isAdmin(new JwtAuthenticationToken(token("u1")))).isTrue();
        assertThat(callerRoles.isAdmin(new JwtAuthenticationToken(token("u2")))).isFalse();
        assertThat(callerRoles.of(new TestingAuthenticationToken("someone", "pw"))).isEmpty();
        assertThat(callerRoles.of(null)).isEmpty();
        assertThat(delegate.calls).isEqualTo(2);
    }
}
