package com.knowledgeforge.knowledgeforge.collab;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * Tells the collaboration service when what it holds is no longer right. Failures are logged and swallowed:
 * the action that caused the call has already happened, and collab closes every connection after 30 minutes anyway.
 */
@Component
public class CollabClient {
    private static final Logger log = LoggerFactory.getLogger(CollabClient.class);

    private final RestClient http;
    private final boolean configured;

    public CollabClient(@Value("${kf.collab.url:http://localhost:1234}") String url, @Value("${kf.collab.secret:}") String secret) {
        SimpleClientHttpRequestFactory timeouts = new SimpleClientHttpRequestFactory();
        timeouts.setConnectTimeout(Duration.ofSeconds(2));
        timeouts.setReadTimeout(Duration.ofSeconds(15)); // a flush waits for one store to Spring
        this.http = RestClient.builder().baseUrl(url).requestFactory(timeouts).defaultHeader("X-Collab-Secret", secret).build();
        this.configured = !secret.isEmpty();
    }

    /** The page's content was replaced (restore): drop the open doc without storing it; clients reload. */
    public void reset(String nodeId) {
        post("/internal/nodes/" + nodeId + "/reset", Map.of());
    }

    /** Access to these pages may have changed (lock, trash, archive, move): their clients fetch a new ticket. */
    public void revalidate(Collection<String> nodeIds) {
        if (!nodeIds.isEmpty()) post("/internal/revalidate", Map.of("nodeIds", List.copyOf(nodeIds)));
    }

    /** This user's access may have changed everywhere (removed, new role, left the team): their clients reconnect. */
    public void revalidateUser(String userId) {
        post("/internal/revalidate", Map.of("userId", userId));
    }

    /** Stores the open doc now, so a version taken next has the latest edits. false = collab could not be reached. */
    public boolean flush(String nodeId) {
        return post("/internal/nodes/" + nodeId + "/flush", Map.of());
    }

    private boolean post(String path, Map<String, Object> body) {
        if (!configured) return true; // no live editing set up: nothing is open anywhere
        try {
            http.post().uri(path).body(body).retrieve().toBodilessEntity();
            return true;
        } catch (RestClientException e) {
            log.warn("Collaboration service call {} failed: {}", path, e.getMessage());
            return false;
        }
    }
}
