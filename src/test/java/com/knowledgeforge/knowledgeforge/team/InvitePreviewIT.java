package com.knowledgeforge.knowledgeforge.team;

import com.knowledgeforge.knowledgeforge.support.NodeIntegrationTest;
import com.knowledgeforge.knowledgeforge.user.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** GET /api/team-invites/{code}: what the join page shows before someone asks to join. */
@AutoConfigureMockMvc
class InvitePreviewIT extends NodeIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired TeamInviteRepository invites;

    private String code;

    private String invite() {
        TeamInvite i = new TeamInvite();
        i.setTeamId(team.getId());
        i.setCreatedBy(admin.getId());
        i.setInviteCode(UUID.randomUUID().toString());
        return invites.save(i).getInviteCode();
    }

    /** Each test uses its own IP so the per-IP limit of one test never leaks into another. */
    private static RequestPostProcessor from(String ip) {
        return r -> { r.setRemoteAddr(ip); return r; };
    }

    private int code(User as, String code, String ip) throws Exception {
        return mvc.perform(get("/api/team-invites/" + code).with(user(as.getEmail())).with(from(ip)))
                .andReturn().getResponse().getStatus();
    }

    @Test
    void returnsPreview() throws Exception {
        code = invite();
        newMember("VIEWER");
        admin.setFullName("Lutfur Sayem");
        users.save(admin);
        mvc.perform(get("/api/team-invites/" + code).with(user(newUser().getEmail())).with(from("10.8.0.1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.teamName").value(team.getName()))
                .andExpect(jsonPath("$.memberCount").value(2))
                .andExpect(jsonPath("$.invitedByName").value("Lutfur Sayem"));
    }

    @Test
    void invitedByIsNullWhenTheCreatorIsGone() throws Exception {
        code = invite();
        users.deleteById(admin.getId());
        mvc.perform(get("/api/team-invites/" + code).with(user(newUser().getEmail())).with(from("10.8.0.2")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.invitedByName").doesNotExist());
    }

    @Test
    void unknownCodeIs404() throws Exception {
        mvc.perform(get("/api/team-invites/nope").with(user(newUser().getEmail())).with(from("10.8.0.3")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Invite code not found"));
    }

    @Test
    void requiresLogin() throws Exception {
        code = invite();
        org.springframework.security.core.context.SecurityContextHolder.clearContext(); // the base class logs the admin in on this thread
        mvc.perform(get("/api/team-invites/" + code).with(from("10.8.0.4")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void responseHasNoEmails() throws Exception {
        code = invite();
        String body = mvc.perform(get("/api/team-invites/" + code).with(user(newUser().getEmail())).with(from("10.8.0.5")))
                .andReturn().getResponse().getContentAsString();
        assertFalse(body.contains("@"), body);
        assertFalse(body.contains(admin.getId()), body);
        assertFalse(body.contains(team.getId()), body);
        assertEquals(3, ((java.util.Map<?, ?>) com.jayway.jsonpath.JsonPath.read(body, "$")).size(), body);
    }

    @Test
    void rateLimitReturns429() throws Exception {
        code = invite();
        User me = newUser();
        for (int i = 0; i < 30; i++) assertEquals(200, code(me, code, "10.8.0.6"), "call " + i);
        assertEquals(429, code(me, code, "10.8.0.6"));
        assertEquals(429, code(me, code, "10.8.0.7"), "same user, other IP: per-user limit");
        assertEquals(429, code(newUser(), code, "10.8.0.6"), "other user, same IP: per-IP limit");
        assertEquals(200, code(newUser(), code, "10.8.0.8"), "other user, other IP");
    }
}
