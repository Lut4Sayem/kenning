package com.knowledgeforge.knowledgeforge.nodecontent;

import com.knowledgeforge.knowledgeforge.access.Access;
import com.knowledgeforge.knowledgeforge.access.NodeAccessService;
import com.knowledgeforge.knowledgeforge.collab.StoreRequest;
import com.knowledgeforge.knowledgeforge.common.UserRef;
import com.knowledgeforge.knowledgeforge.node.Node;
import com.knowledgeforge.knowledgeforge.node.NodeStatus;
import com.knowledgeforge.knowledgeforge.user.User;
import com.mongodb.client.model.FindOneAndUpdateOptions;
import com.mongodb.client.model.ReturnDocument;
import org.bson.Document;
import org.bson.types.Binary;
import org.bson.types.ObjectId;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.Date;
import java.util.HexFormat;
import java.util.List;

@Service
public class NodeContentService {
    static final int MAX_STATE = 4 * 1024 * 1024, MAX_TEXT = 1_000_000, MAX_AUTHORS = 100;
    // longest base64 text a 4 MB state can have, so we refuse before decoding
    private static final int MAX_STATE_BASE64 = (MAX_STATE + 2) / 3 * 4;

    private final NodeContentRepository contents;
    private final NodeAccessService access;
    private final MongoTemplate mongo;

    public NodeContentService(NodeContentRepository contents, NodeAccessService access, MongoTemplate mongo) {
        this.contents = contents;
        this.access = access;
        this.mongo = mongo;
    }

    public ContentDTO get(String nodeId) {
        access.requireView(nodeId);
        NodeContent c = contents.findById(nodeId).orElseThrow(NodeContentService::notFound);
        return new ContentDTO(c.getFormat().name(), Base64.getEncoder().encodeToString(c.getState()), c.getRevision(), c.getContentEpoch());
    }

    /** Content as stored, for the collaboration service (no user: the internal API checked its secret). */
    public ContentDTO contentFor(String nodeId) {
        NodeContent c = contents.findById(nodeId).orElseThrow(NodeContentService::notFound);
        String state = c.getState() == null ? "" : Base64.getEncoder().encodeToString(c.getState());
        return new ContentDTO(c.getFormat().name(), state, c.getRevision(), c.getContentEpoch());
    }

    /**
     * Store from the collaboration service, the only writer while pages are edited live. Same rules as a save, plus
     * the epoch (D6): a doc based on content from before a restore gets 409 EPOCH and is never written.
     */
    public SavedDTO storeFromCollab(String nodeId, StoreRequest req) {
        Node node = mongo.findById(nodeId, Node.class);
        if (node == null) throw notFound();
        if (req.baseRevision() == null || req.baseEpoch() == null) throw bad("baseRevision and baseEpoch are required");
        String text = req.text() == null ? "" : req.text();
        byte[] state = decodeState(req.state(), text);
        List<String> ids = req.authors() == null ? List.of() : req.authors();
        List<ObjectId> authors = ids.stream().filter(ObjectId::isValid).map(ObjectId::new).toList();
        // Defense in depth: collab is told about access changes, but if that call was lost these still hold.
        if (node.getStatus() != NodeStatus.ACTIVE || node.isLocked())
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This page cannot be edited now");
        for (ObjectId a : authors)
            if (access.resolve(a.toHexString(), node) != Access.EDIT)
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Someone who edited no longer has edit access");
        UserRef by = null;
        if (!authors.isEmpty()) {
            User last = mongo.findById(authors.get(authors.size() - 1), User.class);
            if (last != null) by = new UserRef(last.getId(), last.getDisplayName(), last.getProfilePicture());
        }
        return write(node, req.baseRevision(), req.baseEpoch(), state, text, authors, by);
    }

    /** One atomic findAndModify on {_id, revision[, contentEpoch]}: a store from an old revision or epoch matches nothing. */
    private SavedDTO write(Node node, long baseRevision, Integer baseEpoch, byte[] state, String text, List<ObjectId> authors, UserRef by) {
        String nodeId = node.getId();
        Date now = new Date();
        // $literal everywhere: in a pipeline a string starting with "$" would be read as a field path
        Document search = new Document("title", lit(node.getTitle())).append("tags", lit(node.getTags()))
                .append("status", lit(node.getStatus().name())).append("publishState", lit(node.getPublishState().name()));
        // shortcut: at 100 authors the union may drop the newest, upgrade when versions need exact attribution
        Document session = new Document("startedAt", new Document("$ifNull", List.of("$editSession.startedAt", now)))
                .append("lastEditAt", now)
                .append("authors", new Document("$slice", List.of(new Document("$setUnion",
                        List.of(new Document("$ifNull", List.of("$editSession.authors", List.of())), authors)), MAX_AUTHORS)));
        Document set = new Document("state", lit(new Binary(state))).append("text", lit(text))
                .append("contentHash", sha256(state)).append("search", search).append("editSession", session)
                .append("updatedAt", now).append("revision", new Document("$add", List.of("$revision", 1)));

        Document filter = new Document("_id", new ObjectId(nodeId)).append("revision", baseRevision);
        // a page saved before epochs existed has no contentEpoch field: that counts as 0
        if (baseEpoch != null) filter.append("contentEpoch", baseEpoch == 0 ? new Document("$in", Arrays.asList(0, null)) : baseEpoch);
        Document saved = mongo.getCollection("node_contents").findOneAndUpdate(filter, List.of(new Document("$set", set)),
                new FindOneAndUpdateOptions().returnDocument(ReturnDocument.AFTER));
        if (saved == null) {
            NodeContent current = contents.findById(nodeId).orElseThrow(NodeContentService::notFound);
            if (baseEpoch != null && current.getContentEpoch() != baseEpoch) throw new ResponseStatusException(HttpStatus.CONFLICT, "EPOCH");
            throw new StaleRevisionException(current.getRevision());
        }
        Update nodeUpdate = new Update().set("contentUpdatedAt", now).set("updatedAt", now);
        if (by != null) nodeUpdate.set("updatedBy", by);
        mongo.updateFirst(Query.query(Criteria.where("id").is(nodeId)), nodeUpdate, Node.class);
        return new SavedDTO(((Number) saved.get("revision")).longValue(), now);
    }

    /** Size caps and base64 check shared by every endpoint that stores page state (400 / 413). */
    public static byte[] decodeState(String base64, String text) {
        if (base64 == null) throw bad("state is required");
        if (text.length() > MAX_TEXT || base64.length() > MAX_STATE_BASE64) throw tooLarge();
        byte[] state;
        try {
            state = Base64.getDecoder().decode(base64);
        } catch (IllegalArgumentException e) {
            throw bad("state is not valid base64");
        }
        if (state.length > MAX_STATE) throw tooLarge();
        return state;
    }

    private static Document lit(Object v) {
        return new Document("$literal", v);
    }

    public static String sha256(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Page content not found");
    }

    private static ResponseStatusException bad(String m) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, m);
    }

    private static ResponseStatusException tooLarge() {
        return new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "This page is too large to save (limit 4 MB of content, 1 MB of text)");
    }
}
