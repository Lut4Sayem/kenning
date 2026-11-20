package com.knowledgeforge.knowledgeforge.space;

import com.knowledgeforge.knowledgeforge.node.Node;
import com.knowledgeforge.knowledgeforge.node.NodeDTO;
import com.knowledgeforge.knowledgeforge.node.TrashService;
import com.knowledgeforge.knowledgeforge.nodecontent.NodeContent;
import com.knowledgeforge.knowledgeforge.support.NodeIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.junit.jupiter.api.Assertions.*;

/** Team admins delete a team space. Spaces have no trash, so only an empty one (pages in its trash are purged with it). */
class SpaceDeleteIT extends NodeIntegrationTest {
    @Autowired SpaceService spaceService;
    @Autowired TrashService trash;

    private boolean exists() {
        return spaces.existsById(space.getId());
    }

    @Test
    void adminDeletesAnEmptySpaceAndItsTrashGoesWithIt() {
        NodeDTO old = createPage("Old notes");
        trash.trash(old.id());
        spaceService.deleteSpace(space.getId());
        assertFalse(exists());
        assertFalse(mongo.exists(org.springframework.data.mongodb.core.query.Query.query(
                org.springframework.data.mongodb.core.query.Criteria.where("_id").is(old.id())), Node.class));
        assertNull(mongo.findById(old.id(), NodeContent.class));
    }

    @Test
    void aSpaceWithActiveOrArchivedPagesIsRefused() {
        NodeDTO a = createPage("A");
        assertEquals(409, statusOf(() -> spaceService.deleteSpace(space.getId())));
        trash.archive(a.id());
        assertEquals(409, statusOf(() -> spaceService.deleteSpace(space.getId()))); // archived pages count too
        assertTrue(exists());
    }

    @Test
    void onlyTeamAdmins() {
        loginAs(newMember("EDITOR"));
        assertEquals(403, statusOf(() -> spaceService.deleteSpace(space.getId())));
        loginAs(newMember("VIEWER"));
        assertEquals(403, statusOf(() -> spaceService.deleteSpace(space.getId())));
        loginAs(newUser());
        assertEquals(404, statusOf(() -> spaceService.deleteSpace(space.getId())));
        assertTrue(exists());
    }

    @Test
    void thePrivateSpaceCannotBeDeleted() {
        Space mine = spaces.findByOwnerUserId(admin.getId()).orElseThrow();
        assertEquals(400, statusOf(() -> spaceService.deleteSpace(mine.getId())));
        loginAs(newMember("ADMIN"));
        assertEquals(404, statusOf(() -> spaceService.deleteSpace(mine.getId())));
        assertTrue(spaces.existsById(mine.getId()));
    }
}
