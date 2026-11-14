package com.knowledgeforge.knowledgeforge.auth;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** With the proxy trusted (here 127.0.0.1 stands in for Caddy), each forwarded client IP has its own counter. */
@TestPropertySource(properties = "server.tomcat.remoteip.internal-proxies=127[.]0[.]0[.]1")
class TrustedProxyForwardedForIT extends ForwardedIpTestBase {

    @Test
    void eachRealClientIpIsCountedSeparately() throws Exception {
        String email = "proxy-" + System.nanoTime() + "@example.test";
        for (int i = 0; i < 10; i++) assertEquals(401, failedLogin("198.51.100.1", email), "fail " + i);
        assertEquals(429, failedLogin("198.51.100.1", email));
        assertEquals(401, failedLogin("198.51.100.2", email), "another client behind the same proxy");
    }
}
