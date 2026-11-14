package com.knowledgeforge.knowledgeforge.auth;

import com.knowledgeforge.knowledgeforge.support.IntegrationTest;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.net.CookieManager;
import java.net.HttpCookie;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

/** Real Tomcat on a random port, so the proxy header handling runs. The test client always connects from 127.0.0.1. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
abstract class ForwardedIpTestBase extends IntegrationTest {

    @LocalServerPort int port;
    final CookieManager cookies = new CookieManager();
    final HttpClient http = HttpClient.newBuilder().cookieHandler(cookies).build();

    int failedLogin(String forwardedFor, String email) throws Exception {
        http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/app/login")).build(), HttpResponse.BodyHandlers.discarding());
        String token = cookies.getCookieStore().getCookies().stream().filter(c -> c.getName().equals("XSRF-TOKEN"))
                .map(HttpCookie::getValue).findFirst().orElseThrow();
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/auth/login"))
                .header("Content-Type", "application/json").header("X-XSRF-TOKEN", token)
                .POST(HttpRequest.BodyPublishers.ofString("{\"email\":\"" + email + "\",\"password\":\"wrong\"}"));
        if (forwardedFor != null) b.header("X-Forwarded-For", forwardedFor);
        return http.send(b.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
    }
}
