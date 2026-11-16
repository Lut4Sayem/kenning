package com.knowledgeforge.knowledgeforge.team;

import com.knowledgeforge.knowledgeforge.support.NodeIntegrationTest;
import com.knowledgeforge.knowledgeforge.user.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.Date;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Answering join requests: Undo after Decline (QA-06) and the role on Accept (QA-09). */
@AutoConfigureMockMvc
class JoinRequestAnswerIT extends NodeIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired TeamJoinRequestRepository requests;

    private TeamJoinRequest ask(User who) {
        TeamJoinRequest r = new TeamJoinRequest();
        r.setTeamId(team.getId());
        r.setUserId(who.getId());
        r.setStatus("PENDING");
        r.setRequestedAt(new Date());
        return requests.save(r);
    }

    private ResultActions as(User u, MockHttpServletRequestBuilder req) throws Exception {
        return mvc.perform(req.with(user(u.getEmail())).with(csrf()));
    }

    private String url(TeamJoinRequest r, String action) {
        return "/api/teams/" + team.getId() + "/join-requests/" + r.getId() + "/" + action;
    }

    private String role(User u) {
        return members.findByTeamIdAndUserId(team.getId(), u.getId()).map(TeamMember::getRole).orElse(null);
    }

    @Test
    void declineCanBeUndone() throws Exception {
        TeamJoinRequest r = ask(newUser());
        as(admin, post(url(r, "reject"))).andExpect(status().isOk());
        as(admin, post(url(r, "reopen"))).andExpect(status().isOk());
        assertEquals("PENDING", requests.findById(r.getId()).orElseThrow().getStatus());
    }

    @Test
    void undoIsRefusedWhenItIsNoLongerADeclinedRequest() throws Exception {
        TeamJoinRequest pending = ask(newUser());
        as(admin, post(url(pending, "reopen"))).andExpect(status().isConflict());

        User farhan = newUser();
        TeamJoinRequest declined = ask(farhan);
        as(admin, post(url(declined, "reject"))).andExpect(status().isOk());
        ask(farhan); // asked again in the meantime: one pending request is enough
        as(admin, post(url(declined, "reopen"))).andExpect(status().isConflict());
    }

    @Test
    void onlyAdminsCanUndo() throws Exception {
        TeamJoinRequest r = ask(newUser());
        as(admin, post(url(r, "reject"))).andExpect(status().isOk());
        as(newMember("EDITOR"), post(url(r, "reopen"))).andExpect(status().isForbidden());
        assertEquals("REJECTED", requests.findById(r.getId()).orElseThrow().getStatus());
    }

    @Test
    void acceptAddsTheChosenRole() throws Exception {
        User asEditor = newUser(), asDefault = newUser(), asAdmin = newUser();
        as(admin, post(url(ask(asEditor), "accept")).contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"EDITOR\"}"))
                .andExpect(status().isOk());
        as(admin, post(url(ask(asDefault), "accept"))).andExpect(status().isOk());
        TeamJoinRequest bad = ask(asAdmin);
        as(admin, post(url(bad, "accept")).contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"ADMIN\"}"))
                .andExpect(status().isBadRequest());
        assertEquals("EDITOR", role(asEditor));
        assertEquals("VIEWER", role(asDefault));
        assertEquals(null, role(asAdmin));
        assertEquals("PENDING", requests.findById(bad.getId()).orElseThrow().getStatus());
    }
}
