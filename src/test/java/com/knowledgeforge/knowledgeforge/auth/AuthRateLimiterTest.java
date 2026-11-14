package com.knowledgeforge.knowledgeforge.auth;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AuthRateLimiterTest {

    static class MutableClock extends Clock {
        Instant now = Instant.parse("2026-01-01T00:00:00Z");
        public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(java.time.ZoneId z) { return this; }
        public Instant instant() { return now; }
    }

    @Test
    void eleventhAttemptInAMinuteIs429ThenResetsAndIpsAreSeparate() {
        MutableClock clock = new MutableClock();
        AuthRateLimiter limiter = new AuthRateLimiter(clock, 10);
        for (int i = 0; i < 10; i++) limiter.check("login", "1.1.1.1");
        assertEquals(429, assertThrows(ResponseStatusException.class, () -> limiter.check("login", "1.1.1.1")).getStatusCode().value());
        assertDoesNotThrow(() -> limiter.check("login", "2.2.2.2"));
        assertDoesNotThrow(() -> limiter.check("register", "1.1.1.1"));
        clock.now = clock.now.plus(Duration.ofSeconds(61));
        assertDoesNotThrow(() -> limiter.check("login", "1.1.1.1"));
    }
}
