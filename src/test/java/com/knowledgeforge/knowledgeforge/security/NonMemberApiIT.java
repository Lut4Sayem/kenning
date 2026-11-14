package com.knowledgeforge.knowledgeforge.security;

import com.jayway.jsonpath.JsonPath;
import com.knowledgeforge.knowledgeforge.node.NodeDTO;
import com.knowledgeforge.knowledgeforge.support.NodeIntegrationTest;
import com.knowledgeforge.knowledgeforge.user.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/** Over real HTTP routing: a logged-in user who is not in the team gets 403/404 on every team, space and page endpoint. */
@AutoConfigureMockMvc
class NonMemberApiIT extends NodeIntegrationTest {

    @Autowired MockMvc mvc;

    private String json(AbstractMockHttpServletRequestBuilder<?> b, User as, String body) throws Exception {
        b.with(user(as.getEmail())).with(csrf());
        if (body != null) b.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(b).andReturn().getResponse().getContentAsString();
    }

    private void denied(User outsider, AbstractMockHttpServletRequestBuilder<?> b, String body) throws Exception {
        b.with(user(outsider.getEmail())).with(csrf());
        if (body != null) b.contentType(MediaType.APPLICATION_JSON).content(body);
        var r = mvc.perform(b).andReturn();
        int s = r.getResponse().getStatus();
        assertTrue(s == 403 || s == 404, r.getRequest().getMethod() + " " + r.getRequest().getRequestURI() + " gave " + s);
    }

    @Test
    void nonMemberIsDeniedEverywhere() throws Exception {
        NodeDTO page = createPage("Private page");
        NodeDTO child = createPage("Other page");
        String id = page.id();
        String commentId = JsonPath.read(json(post("/api/nodes/" + id + "/comments"), admin, "{\"content\":\"hi\"}"), "$.id");
        String versionId = JsonPath.read(json(post("/api/nodes/" + id + "/versions"), admin, "{\"name\":\"v1\"}"), "$.id");
        var upload = multipart("/api/nodes/" + id + "/attachments/upload")
                .file(new MockMultipartFile("file", "a.txt", "text/plain", "x".getBytes())).with(user(admin.getEmail())).with(csrf());
        String attId = JsonPath.read(mvc.perform(upload).andReturn().getResponse().getContentAsString(), "$.id");
        json(post("/api/nodes/" + child.id() + "/trash"), admin, null);

        json(patch("/api/nodes/" + id), admin, "{\"tags\":[\"secret\"]}");
        User o = newUser();
        // list endpoints answer 200 but must hold nothing of ours
        for (String url : new String[]{"/api/tags/secret/nodes", "/api/search?q=page", "/api/me/recent"})
            org.junit.jupiter.api.Assertions.assertEquals("[]", mvc.perform(get(url).with(user(o.getEmail()))).andReturn()
                    .getResponse().getContentAsString().replaceAll("\\s", ""), url);
        String n = "/api/nodes/" + id;
        String sp = "/api/spaces/" + space.getId();
        String tm = "/api/teams/" + team.getId();
        denied(o, get(sp + "/tree"), null);
        denied(o, post(sp + "/nodes"), "{\"title\":\"x\"}");
        denied(o, get(sp + "/trash"), null);
        denied(o, get(sp + "/archived"), null);
        denied(o, post(sp + "/ai/ask"), "{\"question\":\"q\"}");
        denied(o, get(n), null);
        denied(o, patch(n), "{\"title\":\"x\"}");
        for (String a : new String[]{"publish", "unpublish", "lock", "unlock", "trash", "archive", "unarchive", "session/end"})
            denied(o, post(n + "/" + a), null);
        denied(o, get(n + "/subtree-count"), null);
        denied(o, post(n + "/move"), "{}");
        denied(o, post(n + "/move-to-team"), "{\"spaceId\":\"" + space.getId() + "\"}");
        denied(o, get(n + "/content"), null);
        denied(o, put(n + "/content"), "{\"baseRevision\":0,\"state\":\"\",\"text\":\"x\"}");
        denied(o, post(n + "/edit-lock"), "{\"force\":false}");
        denied(o, delete(n + "/edit-lock"), null);
        denied(o, get(n + "/versions"), null);
        denied(o, post(n + "/versions"), "{\"name\":\"x\"}");
        denied(o, post(n + "/versions/recovered"), "{\"state\":\"\",\"text\":\"x\",\"baseEpoch\":0}");
        denied(o, get("/api/versions/" + versionId), null);
        denied(o, post("/api/versions/" + versionId + "/restore"), null);
        denied(o, get(n + "/comments"), null);
        denied(o, post(n + "/comments"), "{\"content\":\"x\"}");
        denied(o, delete("/api/comments/" + commentId), null);
        denied(o, get(n + "/attachments"), null);
        denied(o, multipart(n + "/attachments/upload").file(new MockMultipartFile("file", "a.txt", "text/plain", "x".getBytes())), null);
        denied(o, get("/api/attachments/" + attId + "/download"), null);
        denied(o, delete("/api/attachments/" + attId), null);
        denied(o, post(n + "/ai/summary"), null);
        denied(o, post("/api/trash/" + child.id() + "/restore"), null);
        denied(o, delete("/api/trash/" + child.id()), null);
        denied(o, get(tm), null);
        denied(o, get(tm + "/spaces"), null);
        denied(o, post(tm + "/spaces"), "{\"name\":\"x\"}");
        denied(o, get(tm + "/join-requests"), null);
        denied(o, post(tm + "/invite"), null);
        denied(o, delete(tm + "/members/" + admin.getId()), null);
        denied(o, put(tm + "/members/" + admin.getId() + "/role"), "{\"role\":\"VIEWER\"}");
    }
}
