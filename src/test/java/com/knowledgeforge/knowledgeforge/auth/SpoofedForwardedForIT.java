package com.knowledgeforge.knowledgeforge.auth;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Default setup: only the Docker network may set X-Forwarded-For, so a header from anywhere else is ignored. */
class SpoofedForwardedForIT extends ForwardedIpTestBase {

    @Test
    void aClientCannotDodgeTheLimitByRotatingTheHeader() throws Exception {
        String email = "spoof-" + System.nanoTime() + "@example.test";
        for (int i = 0; i < 10; i++) assertEquals(401, failedLogin("203.0.113." + i, email), "fail " + i);
        assertEquals(429, failedLogin("203.0.113.200", email));
    }
}
