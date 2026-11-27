package com.knowledgeforge.knowledgeforge.dashboard;

import com.knowledgeforge.knowledgeforge.node.NodeDTO;
import com.knowledgeforge.knowledgeforge.node.TrashService;
import com.knowledgeforge.knowledgeforge.node.UpdateNodeRequest;
import com.knowledgeforge.knowledgeforge.search.SearchResultDTO;
import com.knowledgeforge.knowledgeforge.search.SearchService;
import com.knowledgeforge.knowledgeforge.space.Space;
import com.knowledgeforge.knowledgeforge.support.ExplainAssert;
import com.knowledgeforge.knowledgeforge.support.NodeIntegrationTest;
import com.knowledgeforge.knowledgeforge.team.TeamMember;
import com.knowledgeforge.knowledgeforge.user.User;
import org.bson.types.ObjectId;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** GET /api/me/drafts: drafts I created or last edited, that I can still edit (needs Atlas-local). */
class DraftsIT extends NodeIntegrationTest {
    @Autowired DraftsService drafts;
    @Autowired TrashService trash;
    @Autowired SearchService search;

    private List<String> titles() {
        return drafts.drafts(null).items().stream().map(DraftsDTO.Draft::title).toList();
    }

    @Test
    void onlyMine() {
        createPage("mine");
        User other = newMember("EDITOR");
        loginAs(other);
        createPage("theirs");
        loginAs(admin);
        assertEquals(List.of("mine"), titles());
    }

    @Test
    void createdByMeOrLastEditedByMe() {
        NodeDTO iMade = createPage("i made it");
        User other = newMember("EDITOR");
        loginAs(other);
        NodeDTO theyMade = createPage("they made it");
        nodeService.update(iMade.id(), new UpdateNodeRequest("edited by them", null, null));
        loginAs(admin);
        assertEquals(List.of("edited by them"), titles()); // they made theirs and nobody of us touched it
        nodeService.update(theyMade.id(), new UpdateNodeRequest("edited by me", null, null));
        assertEquals(List.of("edited by me", "edited by them"), titles()); // newest first
    }

    @Test
    void boardsNotInDrafts() {
        nodeService.create(space.getId(), new com.knowledgeforge.knowledgeforge.node.CreateNodeRequest(
                null, "board", null, com.knowledgeforge.knowledgeforge.node.NodeType.BOARD));
        assertEquals(List.of(), titles());
    }

    @Test
    void onlyDrafts() {
        NodeDTO published = createPage("published");
        createPage("draft");
        NodeDTO gone = createPage("trashed");
        nodeService.publish(published.id());
        trash.trash(gone.id());
        assertEquals(List.of("draft"), titles());
    }

    @Test
    void respectsPermissions() {
        createPage("mine");
        assertEquals(1, drafts.drafts(null).total());
        TeamMember me = members.findByTeamIdAndUserId(team.getId(), admin.getId()).orElseThrow();
        me.setRole("VIEWER");
        members.save(me);
        assertEquals(0, drafts.drafts(null).total()); // a viewer cannot edit it any more
        members.delete(me);
        assertEquals(0, drafts.drafts(null).total()); // left the team: no 403 either
    }

    @Test
    void limitKeepsTheTotal() {
        for (String t : List.of("a", "b", "c")) createPage(t);
        DraftsDTO d = drafts.drafts(2);
        assertEquals(2, d.items().size());
        assertEquals(3, d.total());
        assertEquals(team.getName(), d.items().get(0).teamName());
        assertEquals("Docs", d.items().get(0).spaceName());
        assertEquals(400, statusOf(() -> drafts.drafts(0)));
    }

    @Test
    void privatePageHasNoTeam() {
        Space mine = spaces.findByOwnerUserId(admin.getId()).orElseThrow(); // registering creates it
        nodeService.create(mine.getId(), new com.knowledgeforge.knowledgeforge.node.CreateNodeRequest(null, "secret plan", null));
        DraftsDTO.Draft d = drafts.drafts(null).items().get(0);
        assertEquals("secret plan", d.title());
        assertNull(d.teamName());
    }

    @Test
    void usesTheDraftIndexes() {
        ObjectId me = new ObjectId(admin.getId());
        for (String by : List.of("createdBy", "updatedBy")) {
            Query q = new Query(Criteria.where(by + ".id").is(me).and("status").is("ACTIVE").and("publishState").is("DRAFT"))
                    .with(org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC, "updatedAt"));
            ExplainAssert.usesIndex(mongo, "nodes", q, by + "_drafts");
        }
    }

    @Test
    void statusFilterAloneListsDrafts() throws Exception {
        NodeDTO p = createPage("filter only");
        List<SearchResultDTO> r = search.search(null, null, "DRAFT", null, null);
        for (int i = 0; i < 120 && r.stream().noneMatch(x -> p.id().equals(x.nodeId())); i++) { // index lag
            Thread.sleep(500);
            r = search.search(null, null, "DRAFT", null, null);
        }
        assertTrue(r.stream().anyMatch(x -> p.id().equals(x.nodeId())));
    }

    @Test
    void recentCarriesTeamAndOpenTime() {
        NodeDTO p = createPage("opened");
        nodeService.get(p.id());
        SearchResultDTO r = search.recent().get(0);
        assertEquals(team.getName(), r.teamName());
        assertNotNull(r.openedAt());
    }
}
