package com.knowledgeforge.knowledgeforge.collab;

import com.knowledgeforge.knowledgeforge.access.Access;
import com.knowledgeforge.knowledgeforge.access.NodeAccessService;
import com.knowledgeforge.knowledgeforge.node.Node;
import com.knowledgeforge.knowledgeforge.nodecontent.NodeContent;
import com.knowledgeforge.knowledgeforge.nodecontent.NodeContentRepository;
import com.knowledgeforge.knowledgeforge.user.User;
import org.bson.Document;
import org.bson.json.JsonMode;
import org.bson.json.JsonWriterSettings;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;

/**
 * Tickets for the collaboration service: base64url(JSON) + "." + base64url(HMAC-SHA256). Short-lived (60 s) because
 * they only open the socket; access changes later are pushed to collab (revalidate), not waited out.
 */
@Service
public class CollabTicketService {
    static final Duration TTL = Duration.ofSeconds(60);
    private static final JsonWriterSettings JSON = JsonWriterSettings.builder().outputMode(JsonMode.RELAXED).build();
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

    private final String secret;
    private final NodeAccessService access;
    private final NodeContentRepository contents;
    private final Clock clock;

    public CollabTicketService(@Value("${kf.collab.secret:}") String secret, NodeAccessService access,
                               NodeContentRepository contents, Clock clock) {
        this.secret = secret;
        this.access = access;
        this.contents = contents;
        this.clock = clock;
    }

    public TicketDTO ticket(String nodeId) {
        Node node = access.requireView(nodeId); // first: nobody learns anything about a page they cannot see
        if (secret.isEmpty()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Live editing is not configured");
        User me = access.currentUser();
        // resolve applies the page's state: a locked page is VIEW even for its editors
        String level = access.resolve(me.getId(), node) == Access.EDIT ? "EDIT" : "VIEW";
        int epoch = contents.findById(nodeId).map(NodeContent::getContentEpoch).orElse(0);
        Document payload = new Document("nodeId", nodeId).append("userId", me.getId()).append("name", me.getDisplayName())
                .append("access", level).append("epoch", epoch).append("exp", clock.millis() + TTL.toMillis());
        return new TicketDTO(sign(payload.toJson(JSON)), level, epoch);
    }

    String sign(String payloadJson) {
        String payload = B64.encodeToString(payloadJson.getBytes(StandardCharsets.UTF_8));
        return payload + "." + mac(payload);
    }

    private String mac(String payloadPart) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return B64.encodeToString(mac.doFinal(payloadPart.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Constant-time check of the X-Collab-Secret header; no secret configured = nothing passes. */
    public boolean secretMatches(String header) {
        return !secret.isEmpty() && header != null
                && MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8), header.getBytes(StandardCharsets.UTF_8));
    }
}
