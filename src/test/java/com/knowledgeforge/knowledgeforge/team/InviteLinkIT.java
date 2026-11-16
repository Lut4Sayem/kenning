package com.knowledgeforge.knowledgeforge.team;

import com.jayway.jsonpath.JsonPath;
import com.knowledgeforge.knowledgeforge.common.SchemaSetup;
import com.knowledgeforge.knowledgeforge.support.NodeIntegrationTest;
import com.knowledgeforge.knowledgeforge.user.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.Date;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** QA-03: one invite link per team; a new link or "Turn off link" stops the old code at once. */
@AutoConfigureMockMvc
class InviteLinkIT extends NodeIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired TeamInviteRepository invites;
    @Autowired SchemaSetup schemaSetup;

    private static final AtomicInteger IP = new AtomicInteger(1);

    /** Own IP per call: the preview's per-IP limit must not leak between tests. */
    private ResultActions as(User u, MockHttpServletRequestBuilder req) throws Exception {
        String ip = "10.6." + (IP.get() / 250) + "." + (IP.getAndIncrement() % 250);
        return mvc.perform(req.with(user(u.getEmail())).with(csrf()).with(r -> { r.setRemoteAddr(ip); return r; }));
    }

    private String create() throws Exception {
        String body = as(admin, post("/api/teams/" + team.getId() + "/invite")).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.inviteCode");
    }

    @Test
    void newLinkReplacesTheOldOne() throws Exception {
        String a = create(), b = create();
        User outsider = newUser();
        as(outsider, get("/api/team-invites/" + a)).andExpect(status().isNotFound());
        as(outsider, post("/api/team-invites/" + a + "/join")).andExpect(status().isNotFound());
        as(outsider, get("/api/team-invites/" + b)).andExpect(status().isOk());
        assertEquals(1, invites.findAll().stream().filter(i -> team.getId().equals(i.getTeamId())).count());
    }

    @Test
    void adminSeesTheCurrentLinkWithWhoMadeItAndWhen() throws Exception {
        admin.setFullName("Ayesha Rahman");
        users.save(admin);
        as(admin, get("/api/teams/" + team.getId() + "/invite")).andExpect(status().isNoContent());
        String code = create();
        as(admin, get("/api/teams/" + team.getId() + "/invite")).andExpect(status().isOk())
                .andExpect(jsonPath("$.inviteCode").value(code))
                .andExpect(jsonPath("$.createdByName").value("Ayesha Rahman"))
                .andExpect(jsonPath("$.createdAt").exists());
    }

    @Test
    void turnOffStopsTheLink() throws Exception {
        String code = create();
        as(admin, delete("/api/teams/" + team.getId() + "/invite")).andExpect(status().isNoContent());
        User outsider = newUser();
        as(outsider, get("/api/team-invites/" + code)).andExpect(status().isNotFound());
        as(outsider, post("/api/team-invites/" + code + "/join")).andExpect(status().isNotFound());
        as(admin, get("/api/teams/" + team.getId() + "/invite")).andExpect(status().isNoContent());
    }

    @Test
    void onlyAdminsSeeOrChangeTheLink() throws Exception {
        create();
        User editor = newMember("EDITOR");
        as(editor, get("/api/teams/" + team.getId() + "/invite")).andExpect(status().isForbidden());
        as(editor, delete("/api/teams/" + team.getId() + "/invite")).andExpect(status().isForbidden());
        as(editor, post("/api/teams/" + team.getId() + "/invite")).andExpect(status().isForbidden());
        as(newUser(), get("/api/teams/" + team.getId() + "/invite")).andExpect(status().isForbidden());
    }

    @Test
    void startupKeepsOnlyEachTeamsNewestLink() {
        mongo.indexOps("teamInvites").dropIndex("teamId_unique"); // let the old data in, as it was before the fix
        for (long t : new long[]{1_000, 3_000, 2_000}) {
            TeamInvite i = new TeamInvite();
            i.setTeamId(team.getId());
            i.setInviteCode("old-" + t + "-" + team.getId());
            i.setCreatedAt(new Date(t));
            invites.save(i);
        }
        schemaSetup.run(null);
        List<String> left = invites.findAll().stream().filter(i -> team.getId().equals(i.getTeamId())).map(TeamInvite::getInviteCode).toList();
        assertEquals(List.of("old-3000-" + team.getId()), left);
    }
}
