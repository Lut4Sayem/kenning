package com.knowledgeforge.knowledgeforge.team;

import com.knowledgeforge.knowledgeforge.support.NodeIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** QA-63: team admins rename the team (and change its description). */
class TeamRenameIT extends NodeIntegrationTest {
    @Autowired TeamService teamService;
    @Autowired TeamRepository teamRepository;
    @Autowired TeamOverviewService overview;

    private Team reload() {
        return teamRepository.findById(team.getId()).orElseThrow();
    }

    @Test
    void adminRenamesTrimmedAndItShowsInTheActivity() {
        Team t = teamService.updateTeam(team.getId(), new UpdateTeamRequest("  Thesis Group  ", "Our CSE391 thesis"));
        assertEquals("Thesis Group", t.getName());
        assertEquals("Thesis Group", reload().getName());
        assertEquals("Our CSE391 thesis", reload().getDescription());

        List<TeamOverviewDTO.ActivityItem> feed = overview.activity(team.getId(), 5);
        assertEquals("RENAME_TEAM", feed.get(0).action());
        assertEquals("Thesis Group", feed.get(0).targetTitle());
    }

    @Test
    void leavingAFieldOutKeepsIt() {
        teamService.updateTeam(team.getId(), new UpdateTeamRequest(null, "Only the description"));
        assertEquals(team.getName(), reload().getName());
        teamService.updateTeam(team.getId(), new UpdateTeamRequest("New name", null));
        assertEquals("Only the description", reload().getDescription());
        // a description change alone is not a rename
        assertEquals(1, overview.activity(team.getId(), 5).size());
    }

    @Test
    void onlyAdmins() {
        loginAs(newMember("EDITOR"));
        assertEquals(403, statusOf(() -> teamService.updateTeam(team.getId(), new UpdateTeamRequest("Mine now", null))));
        loginAs(newMember("VIEWER"));
        assertEquals(403, statusOf(() -> teamService.updateTeam(team.getId(), new UpdateTeamRequest("Mine now", null))));
        loginAs(newUser());
        assertEquals(404, statusOf(() -> teamService.updateTeam(team.getId(), new UpdateTeamRequest("Mine now", null))));
        assertNotEquals("Mine now", reload().getName());
    }

    @Test
    void nameAndDescriptionAreChecked() {
        assertEquals(400, statusOf(() -> teamService.updateTeam(team.getId(), new UpdateTeamRequest("   ", null))));
        assertEquals(400, statusOf(() -> teamService.updateTeam(team.getId(), new UpdateTeamRequest("x".repeat(61), null))));
        assertEquals(400, statusOf(() -> teamService.updateTeam(team.getId(), new UpdateTeamRequest(null, "d".repeat(281)))));
        teamService.updateTeam(team.getId(), new UpdateTeamRequest("x".repeat(60), "d".repeat(280))); // limits included
        assertEquals(60, reload().getName().length());
    }
}
