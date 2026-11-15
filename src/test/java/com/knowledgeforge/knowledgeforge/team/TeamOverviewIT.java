package com.knowledgeforge.knowledgeforge.team;

import com.knowledgeforge.knowledgeforge.activity.ActivityLogService;
import com.knowledgeforge.knowledgeforge.node.Node;
import com.knowledgeforge.knowledgeforge.node.NodeDTO;
import com.knowledgeforge.knowledgeforge.node.NodeRepository;
import com.knowledgeforge.knowledgeforge.node.TrashService;
import com.knowledgeforge.knowledgeforge.node.UpdateNodeRequest;
import com.knowledgeforge.knowledgeforge.support.NodeIntegrationTest;
import com.knowledgeforge.knowledgeforge.team.TeamOverviewDTO.ActivityItem;
import com.knowledgeforge.knowledgeforge.user.User;
import org.bson.types.ObjectId;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** The team overview read models: one visibility pass, so the numbers agree everywhere (needs Atlas-local). */
class TeamOverviewIT extends NodeIntegrationTest {
    @Autowired TeamOverviewService overview;
    @Autowired NodeRepository nodes;
    @Autowired TrashService trash;
    @Autowired ActivityLogService activityLog;

    private void restrictToSomeoneElse(String nodeId) {
        Node n = nodes.findById(nodeId).orElseThrow();
        Node.Restriction r = new Node.Restriction();
        r.setViewers(List.of(new ObjectId().toHexString()));
        n.setRestriction(r);
        nodes.save(n);
    }

    @Test
    void summaryCountsOnlyWhatICanSee() {
        for (int i = 0; i < 5; i++) newMember("EDITOR");
        createPage("a");
        createPage("b");
        NodeDTO secret = createPage("secret");
        restrictToSomeoneElse(secret.id()); // I am the admin: title-only, so it is left out
        var s = overview.summary(team.getId());
        assertEquals(team.getName(), s.name());
        assertEquals(6, s.memberCount());
        assertEquals(4, s.firstMembers().size());
        assertEquals(1, s.spaceCount());
        assertEquals(2, s.pageCount());
        assertEquals("ADMIN", s.myRole());
        assertNotNull(s.updatedAt());
    }

    @Test
    void numbersAgreeAcrossSummarySpacesAndPages() {
        createPage("one");
        NodeDTO two = createPage("two");
        nodeService.publish(two.id());
        restrictToSomeoneElse(createPage("hidden").id());
        assertEquals(2, overview.summary(team.getId()).pageCount());
        var sp = overview.spaces(team.getId()).get(0);
        assertEquals(2, sp.pageCount());
        assertEquals(1, sp.draftCount());
        assertEquals(2, overview.pages(team.getId(), null, null, null, null, null, null).total());
    }

    @Test
    void nonMembersAreRefused() {
        loginAs(newUser());
        assertEquals(403, statusOf(() -> overview.summary(team.getId())));
        assertEquals(403, statusOf(() -> overview.pages(team.getId(), null, null, null, null, null, null)));
        assertEquals(403, statusOf(() -> overview.activity(team.getId(), null)));
        assertEquals(403, statusOf(() -> overview.spaces(team.getId())));
    }

    @Test
    void pagesFilterSortAndPage() {
        User other = newMember("EDITOR");
        NodeDTO b = createPage("Banana");
        createPage("apple");
        loginAs(other);
        NodeDTO c = createPage("Cherry");
        nodeService.update(c.id(), new UpdateNodeRequest("Cherry!", null, null));
        loginAs(admin);
        nodeService.publish(b.id());

        assertEquals(List.of("apple", "Banana", "Cherry!"), titles(overview.pages(team.getId(), null, null, null, "title", null, null)));
        assertEquals(List.of("Banana", "Cherry!", "apple"), titles(overview.pages(team.getId(), null, null, null, null, null, null))); // newest edit first
        assertEquals(List.of("Banana"), titles(overview.pages(team.getId(), "published", null, null, null, null, null)));
        assertEquals(List.of("Cherry!"), titles(overview.pages(team.getId(), null, null, other.getId(), null, null, null)));
        assertEquals(0, overview.pages(team.getId(), null, new ObjectId().toHexString(), null, null, null, null).total());

        var page2 = overview.pages(team.getId(), null, null, null, "title", 1, 2);
        assertEquals(3, page2.total());
        assertEquals(List.of("Cherry!"), titles(page2));
        assertEquals("Docs", page2.items().get(0).spaceName());
        assertEquals(other.getId(), page2.items().get(0).lastEditorId());
    }

    @Test
    void pagesValidateTheirInput() {
        assertEquals(400, statusOf(() -> overview.pages(team.getId(), "nope", null, null, null, null, null)));
        assertEquals(400, statusOf(() -> overview.pages(team.getId(), null, null, null, "random", null, null)));
        assertEquals(400, statusOf(() -> overview.pages(team.getId(), null, null, null, null, 0, 101)));
        assertEquals(400, statusOf(() -> overview.pages(team.getId(), null, null, null, null, -1, 10)));
    }

    @Test
    void subPageNamesItsParent() {
        NodeDTO parent = createPage("Parent");
        nodeService.create(space.getId(), new com.knowledgeforge.knowledgeforge.node.CreateNodeRequest(parent.id(), "Child", null));
        var items = overview.pages(team.getId(), null, null, null, "title", null, null).items();
        assertEquals("Parent", items.stream().filter(i -> i.title().equals("Child")).findFirst().orElseThrow().parentTitle());
        assertNull(items.stream().filter(i -> i.title().equals("Parent")).findFirst().orElseThrow().parentTitle());
    }

    @Test
    void activityShowsCreateAndPublishNewestFirstAndRespectsLimit() {
        NodeDTO a = createPage("Use cases");
        nodeService.publish(a.id());
        List<ActivityItem> feed = overview.activity(team.getId(), 5);
        assertEquals(List.of("PUBLISH_NODE", "CREATE_NODE"), feed.stream().map(ActivityItem::action).toList());
        assertEquals("Test User", feed.get(0).actorName());
        assertEquals("Use cases", feed.get(0).targetTitle());
        assertEquals(1, overview.activity(team.getId(), 1).size());
        assertEquals(400, statusOf(() -> overview.activity(team.getId(), 21)));
    }

    @Test
    void activityKeepsTrashedPagesButDropsPurgedAndHiddenOnes() {
        NodeDTO kept = createPage("Kept");
        trash.trash(kept.id()); // logged TRASH_NODE; the page is trashed, not gone
        NodeDTO hidden = createPage("Hidden");
        restrictToSomeoneElse(hidden.id());
        activityLog.log(team.getId(), admin.getId(), "PURGE_NODE", "NODE", new ObjectId().toHexString(), "Gone");
        List<String> titles = overview.activity(team.getId(), 20).stream().map(ActivityItem::targetTitle).toList();
        assertTrue(titles.contains("Kept"));
        assertFalse(titles.contains("Hidden"));
        assertFalse(titles.contains("Gone"));
    }

    @Test
    void activityNeverShowsAnotherTeamsEvents() {
        NodeDTO mine = createPage("Mine");
        Team other = new Team();
        other.setName("Other " + java.util.UUID.randomUUID());
        other = teams.save(other);
        activityLog.log(other.getId(), admin.getId(), "CREATE_NODE", "NODE", mine.id(), "Mine");
        assertEquals(1, overview.activity(team.getId(), 20).size());
    }

    private static List<String> titles(TeamOverviewDTO.Pages p) {
        return p.items().stream().map(TeamOverviewDTO.PageItem::title).toList();
    }
}
