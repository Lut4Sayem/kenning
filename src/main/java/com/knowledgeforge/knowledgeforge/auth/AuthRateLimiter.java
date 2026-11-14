package com.knowledgeforge.knowledgeforge.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.util.concurrent.ConcurrentHashMap;

/** Per-IP limit for login and register (each counted separately). */
@Component
public class AuthRateLimiter {

    private static final long WINDOW_MS = 60_000;
    private final ConcurrentHashMap<String, long[]> windows = new ConcurrentHashMap<>();
    private final Clock clock;
    private final int limit;

    public AuthRateLimiter(Clock clock, @Value("${kf.auth.rate-limit-per-minute:10}") int limit) {
        this.clock = clock;
        this.limit = limit;
    }

    // shortcut: in-memory fixed window, one app instance only; use a shared store (Redis) when we run several instances
    /** Register: every call counts, per IP. */
    public void check(String action, String ip) {
        if (count(action + "|" + ip, true) > limit) tooMany();
    }

    /** Login: refuses when this IP + email already failed {@code limit} times this minute. Reading does not count. */
    public void assertLoginAllowed(String ip, String email) {
        if (count(loginKey(ip, email), false) >= limit) tooMany();
    }

    /** Only failed logins count, so classmates behind one IP who sign in correctly never hit the limit. */
    public void recordLoginFailure(String ip, String email) {
        count(loginKey(ip, email), true);
    }

    private static String loginKey(String ip, String email) {
        return "login|" + ip + "|" + (email == null ? "" : email.trim().toLowerCase(java.util.Locale.ROOT));
    }

    private long count(String key, boolean add) {
        long now = clock.millis();
        if (windows.size() > 10_000) windows.clear(); // keeps memory bounded; a flood of fake IPs only resets everyone's window
        long[] w = windows.compute(key, (k, old) -> {
            if (old == null || now - old[0] >= WINDOW_MS) return add ? new long[]{now, 1} : null;
            if (add) old[1]++;
            return old;
        });
        return w == null ? 0 : w[1];
    }

    private static void tooMany() {
        throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts, wait a minute");
    }
}
