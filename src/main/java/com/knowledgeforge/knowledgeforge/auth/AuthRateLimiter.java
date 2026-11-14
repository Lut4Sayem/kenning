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
    public void check(String action, String ip) {
        long now = clock.millis();
        if (windows.size() > 10_000) windows.clear(); // keeps memory bounded; a flood of fake IPs only resets everyone's window
        long[] w = windows.compute(action + "|" + ip, (k, old) -> {
            if (old == null || now - old[0] >= WINDOW_MS) return new long[]{now, 1};
            old[1]++;
            return old;
        });
        if (w[1] > limit) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts, wait a minute");
    }
}
