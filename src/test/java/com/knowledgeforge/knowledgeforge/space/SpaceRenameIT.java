package com.knowledgeforge.knowledgeforge.space;

import com.knowledgeforge.knowledgeforge.support.NodeIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.junit.jupiter.api.Assertions.*;

/** Team admins and editors rename a team space; the personal Private space keeps its name. */
class SpaceRenameIT extends NodeIntegrationTest {
    @Autowired SpaceService spaceService;

    private String name() {
        return spaces.findById(space.getId()).orElseThrow().getName();
    }

    @Test
    void adminsAndEditorsRenameTrimmed() {
        assertEquals("Experiments", spaceService.renameSpace(space.getId(), new RenameSpaceRequest("  Experiments  ")).getName());
        assertEquals("Experiments", name());
        loginAs(newMember("EDITOR"));
        spaceService.renameSpace(space.getId(), new RenameSpaceRequest("Lab notes"));
        assertEquals("Lab notes", name());
    }

    @Test
    void viewersAndOutsidersCannot() {
        loginAs(newMember("VIEWER"));
        assertEquals(403, statusOf(() -> spaceService.renameSpace(space.getId(), new RenameSpaceRequest("Mine"))));
        loginAs(newUser());
        assertEquals(404, statusOf(() -> spaceService.renameSpace(space.getId(), new RenameSpaceRequest("Mine"))));
        assertEquals(404, statusOf(() -> spaceService.renameSpace("000000000000000000000000", new RenameSpaceRequest("Mine"))));
        assertEquals("Docs", name());
    }

    @Test
    void nameRulesAreThePageTitleRulesButNotEmpty() {
        assertEquals(400, statusOf(() -> spaceService.renameSpace(space.getId(), new RenameSpaceRequest("   "))));
        assertEquals(400, statusOf(() -> spaceService.renameSpace(space.getId(), new RenameSpaceRequest(null))));
        assertEquals(400, statusOf(() -> spaceService.renameSpace(space.getId(), new RenameSpaceRequest("x".repeat(201)))));
        spaceService.renameSpace(space.getId(), new RenameSpaceRequest("x".repeat(200))); // limit included
        assertEquals(200, name().length());
    }

    @Test
    void thePrivateSpaceCannotBeRenamed() {
        Space mine = spaces.findByOwnerUserId(admin.getId()).orElseThrow();
        assertEquals(400, statusOf(() -> spaceService.renameSpace(mine.getId(), new RenameSpaceRequest("Personal"))));
        loginAs(newMember("ADMIN"));
        assertEquals(404, statusOf(() -> spaceService.renameSpace(mine.getId(), new RenameSpaceRequest("Personal")))); // someone else's
        assertEquals("Private", spaces.findById(mine.getId()).orElseThrow().getName());
    }
}
