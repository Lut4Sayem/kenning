package com.knowledgeforge.knowledgeforge.user;

import com.knowledgeforge.knowledgeforge.support.NodeIntegrationTest;
import com.knowledgeforge.knowledgeforge.team.TeamJoinRequest;
import com.knowledgeforge.knowledgeforge.team.TeamJoinRequestRepository;
import com.knowledgeforge.knowledgeforge.team.TeamMember;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Date;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** QA-52: accounts made before names were required have no full name; every screen shows the email's local part instead. */
@AutoConfigureMockMvc
class NamelessUserIT extends NodeIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired TeamJoinRequestRepository requests;

    private User nameless() {
        User u = newUser();
        u.setFullName(null);
        return users.save(u);
    }

    private String localPart(User u) {
        return u.getEmail().substring(0, u.getEmail().indexOf('@'));
    }

    @Test
    void membersRequestsAndCommentsFallBackToTheEmailLocalPart() throws Exception {
        User member = nameless();
        TeamMember m = new TeamMember();
        m.setTeamId(team.getId());
        m.setUserId(member.getId());
        m.setRole("EDITOR");
        members.save(m);

        User asking = nameless();
        TeamJoinRequest r = new TeamJoinRequest();
        r.setTeamId(team.getId());
        r.setUserId(asking.getId());
        r.setStatus("PENDING");
        r.setRequestedAt(new Date());
        requests.save(r);

        mvc.perform(get("/api/teams/" + team.getId()).with(user(admin.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.teamMembers[?(@.userId == '" + member.getId() + "')].fullName").value(localPart(member)));
        mvc.perform(get("/api/teams/" + team.getId() + "/join-requests").with(user(admin.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].fullName").value(localPart(asking)));

        loginAs(admin);
        String pageId = createPage("Notes").id();
        mvc.perform(post("/api/nodes/" + pageId + "/comments").with(user(member.getEmail())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"content\":\"hi\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.createdByFullName").value(localPart(member)));
        mvc.perform(get("/api/teams/" + team.getId() + "/summary").with(user(admin.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.firstMembers[?(@.userId == '" + member.getId() + "')].fullName").value(localPart(member)));
    }
}
