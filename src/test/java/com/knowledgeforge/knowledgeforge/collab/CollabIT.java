package com.knowledgeforge.knowledgeforge.collab;

import com.knowledgeforge.knowledgeforge.node.Node;
import com.knowledgeforge.knowledgeforge.node.NodeDTO;
import com.knowledgeforge.knowledgeforge.nodecontent.NodeContent;
import com.knowledgeforge.knowledgeforge.nodecontent.NodeContentService;
import com.knowledgeforge.knowledgeforge.support.NodeIntegrationTest;
import com.knowledgeforge.knowledgeforge.user.User;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
@TestPropertySource(properties = "kf.collab.secret=test-secret")
class CollabIT extends NodeIntegrationTest {
    @Autowired CollabTicketService tickets;
    @Autowired NodeContentService contents;
    @Autowired MockMvc mvc;

    private static Document payload(TicketDTO t) {
        String part = t.ticket().substring(0, t.ticket().indexOf('.'));
        return Document.parse(new String(Base64.getUrlDecoder().decode(part), StandardCharsets.UTF_8));
    }

    private static String b64(String s) {
        return Base64.getEncoder().encodeToString(s.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void collabTicketNeedsView() {
        NodeDTO p = createPage("A");
        loginAs(newUser()); // not in the team
        int status = statusOf(() -> tickets.ticket(p.id()));
        assertTrue(status == 403 || status == 404, "got " + status);
    }

    @Test
    void ticketAccessMatchesRole() {
        NodeDTO p = createPage("A");
        TicketDTO mine = tickets.ticket(p.id());
        assertEquals("EDIT", mine.access());
        Document d = payload(mine);
        assertEquals(p.id(), d.getString("nodeId"));
        assertEquals(admin.getId(), d.getString("userId"));
        assertEquals("EDIT", d.getString("access"));
        assertEquals(0, d.getInteger("epoch"));
        assertEquals(60_000, ((Number) d.get("exp")).longValue() - ((Number) d.get("iat")).longValue());
        long left = ((Number) d.get("exp")).longValue() - System.currentTimeMillis();
        assertTrue(left > 55_000 && left <= 60_000, "exp in " + left + " ms");

        loginAs(newMember("VIEWER"));
        assertEquals("VIEW", tickets.ticket(p.id()).access());
        assertEquals("VIEW", payload(tickets.ticket(p.id())).getString("access"));

        User editor = newMember("EDITOR");
        loginAs(admin);
        nodeService.lock(p.id());
        loginAs(editor);
        assertEquals("VIEW", tickets.ticket(p.id()).access()); // locked: nobody types
    }

    @Test
    void internalApiRejectsWithoutSecret() throws Exception {
        NodeDTO p = createPage("A");
        String url = "/internal/collab/nodes/" + p.id() + "/content";
        mvc.perform(get(url)).andExpect(status().isForbidden());
        mvc.perform(get(url).header("X-Collab-Secret", "wrong")).andExpect(status().isForbidden());
        mvc.perform(put(url).contentType(MediaType.APPLICATION_JSON)
                .content("{\"baseRevision\":0,\"baseEpoch\":0,\"state\":\"" + b64("x") + "\",\"text\":\"x\",\"authors\":[]}"))
                .andExpect(status().isForbidden());
        mvc.perform(get(url).header("X-Collab-Secret", "test-secret")).andExpect(status().isOk());
        mvc.perform(put(url).header("X-Collab-Secret", "test-secret").contentType(MediaType.APPLICATION_JSON)
                .content("{\"baseRevision\":0,\"baseEpoch\":0,\"state\":\"" + b64("x") + "\",\"text\":\"x\",\"authors\":[]}"))
                .andExpect(status().isOk());
    }

    @Test
    void publicContentPutIsGone() throws Exception {
        NodeDTO p = createPage("A");
        mvc.perform(put("/api/nodes/" + p.id() + "/content").with(user(admin.getEmail())).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"baseRevision\":0,\"state\":\"" + b64("x") + "\",\"text\":\"x\"}"))
                .andExpect(status().isMethodNotAllowed());
    }

    @Test
    void staleEpochStoreRejected() {
        NodeDTO p = createPage("A");
        mongo.updateFirst(Query.query(Criteria.where("id").is(p.id())), new Update().set("contentEpoch", 1), NodeContent.class);
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> contents.storeFromCollab(p.id(), new StoreRequest(0L, 0, b64("old"), "old", List.of(admin.getId()))));
        assertEquals(409, e.getStatusCode().value());
        assertEquals("EPOCH", e.getReason());
        assertEquals(0, mongo.findById(p.id(), NodeContent.class).getRevision());
        // the same store on the current epoch goes through
        assertEquals(1, contents.storeFromCollab(p.id(), new StoreRequest(0L, 1, b64("new"), "new", List.of())).revision());
    }

    @Test
    void storeRefusedWhenThePageOrAnAuthorCanNoLongerBeEdited() {
        NodeDTO p = createPage("A");
        User viewer = newMember("VIEWER");
        assertEquals(403, statusOf(() -> contents.storeFromCollab(p.id(), new StoreRequest(0L, 0, b64("x"), "x", List.of(viewer.getId())))));
        nodeService.lock(p.id());
        assertEquals(403, statusOf(() -> contents.storeFromCollab(p.id(), new StoreRequest(0L, 0, b64("x"), "x", List.of(admin.getId())))));
        assertEquals(0, mongo.findById(p.id(), NodeContent.class).getRevision());
    }

    @Test
    void storeKeepsRules() {
        NodeDTO p = createPage("Title");
        User other = newMember("EDITOR");
        assertEquals(1, contents.storeFromCollab(p.id(),
                new StoreRequest(0L, 0, b64("state"), "hello", List.of(admin.getId(), other.getId()))).revision());
        NodeContent c = mongo.findById(p.id(), NodeContent.class);
        assertEquals("hello", c.getText());
        assertEquals(List.of(admin.getId(), other.getId()).stream().sorted().toList(),
                c.getEditSession().getAuthors().stream().sorted().toList());
        Document raw = mongo.getCollection("node_contents").find(new Document("_id", new ObjectId(p.id()))).first();
        assertEquals("Title", ((Document) raw.get("search")).getString("title"));
        assertEquals(other.getId(), mongo.findById(p.id(), Node.class).getUpdatedBy().getUserId());
        // a stale revision is still a plain 409, not EPOCH
        assertThrows(RuntimeException.class, () -> contents.storeFromCollab(p.id(), new StoreRequest(0L, 0, b64("s"), "", List.of())));
    }
}
