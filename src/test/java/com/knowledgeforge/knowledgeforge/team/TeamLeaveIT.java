package com.knowledgeforge.knowledgeforge.team;

import com.knowledgeforge.knowledgeforge.node.NodeDTO;
import com.knowledgeforge.knowledgeforge.support.NodeIntegrationTest;
import com.knowledgeforge.knowledgeforge.user.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

/** QA-68: members leave a team; the last admin cannot, and pages stay in the team. */
class TeamLeaveIT extends NodeIntegrationTest {
    @Autowired TeamService teamService;

    @Test
    void editorLeavesAndTheirPagesStay() {
        User editor = newMember("EDITOR");
        loginAs(editor);
        NodeDTO page = createPage("Mine");
        teamService.leaveTeam(team.getId());
        assertFalse(members.existsByTeamIdAndUserId(team.getId(), editor.getId()));
        assertTrue(mongo.findById(page.id(), com.knowledgeforge.knowledgeforge.node.Node.class) != null, "the page stays in the team");
        assertEquals(404, statusOf(() -> teamService.leaveTeam(team.getId())), "already gone");
    }

    @Test
    void viewerLeaves() {
        User viewer = newMember("VIEWER");
        loginAs(viewer);
        teamService.leaveTeam(team.getId());
        assertFalse(members.existsByTeamIdAndUserId(team.getId(), viewer.getId()));
    }

    @Test
    void lastAdminCannotLeaveButOneOfTwoCan() {
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> teamService.leaveTeam(team.getId()));
        assertEquals(400, e.getStatusCode().value());
        assertEquals("Make someone else an admin or delete the team first.", e.getReason());
        assertTrue(members.existsByTeamIdAndUserId(team.getId(), admin.getId()));

        newMember("ADMIN");
        teamService.leaveTeam(team.getId());
        assertFalse(members.existsByTeamIdAndUserId(team.getId(), admin.getId()));
    }

    @Test
    void outsiderGets404() {
        loginAs(newUser());
        assertEquals(404, statusOf(() -> teamService.leaveTeam(team.getId())));
    }
}
