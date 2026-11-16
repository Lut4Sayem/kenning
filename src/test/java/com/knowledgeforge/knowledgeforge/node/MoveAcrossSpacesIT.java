package com.knowledgeforge.knowledgeforge.node;

import com.knowledgeforge.knowledgeforge.nodecontent.NodeContent;
import com.knowledgeforge.knowledgeforge.nodeversion.NodeVersion;
import com.knowledgeforge.knowledgeforge.nodeversion.NodeVersionService;
import com.knowledgeforge.knowledgeforge.nodeversion.VersionKind;
import com.knowledgeforge.knowledgeforge.space.Space;
import com.knowledgeforge.knowledgeforge.space.SpaceService;
import com.knowledgeforge.knowledgeforge.support.NodeIntegrationTest;
import com.knowledgeforge.knowledgeforge.team.Team;
import com.knowledgeforge.knowledgeforge.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** QA-12: a team page (with its sub-pages) moves to another space of the same team. */
class MoveAcrossSpacesIT extends NodeIntegrationTest {
    @Autowired NodeRepository nodes;
    @Autowired TrashService trash;
    @Autowired NodeVersionService versions;
    @Autowired SpaceService spaceService;

    Space other;

    @BeforeEach
    void otherSpace() {
        other = teamSpace(team, "Experiments");
    }

    private Space teamSpace(Team t, String name) {
        Space s = new Space();
        s.setName(name);
        s.setTeamId(t.getId());
        s.setOwnerType(Space.OwnerType.TEAM);
        return spaces.save(s);
    }

    private NodeDTO child(NodeDTO parent, String title) {
        return nodeService.create(parent.spaceId(), new CreateNodeRequest(parent.id(), title, null));
    }

    private Node node(String id) {
        return nodes.findById(id).orElseThrow();
    }

    @Test
    void branchMovesToTopOfOtherSpace() {
        NodeDTO a = createPage("Methodology");
        NodeDTO b = child(a, "Sampling");
        NodeDTO c = child(b, "Survey");
        NodeDTO gone = child(a, "Old notes");
        trash.trash(gone.id());
        versions.createVersion(a.id(), VersionKind.NAMED, "v1");

        NodeDTO moved = nodeService.move(a.id(), new MoveNodeRequest(null, null, null, other.getId()));

        assertEquals(other.getId(), moved.spaceId());
        assertNull(moved.parentId());
        for (NodeDTO n : List.of(a, b, c, gone)) {
            assertEquals(other.getId(), node(n.id()).getSpaceId(), n.title());
            assertEquals(other.getId(), mongo.findById(n.id(), NodeContent.class).getSpaceId(), n.title());
        }
        assertEquals(List.of(a.id()), node(b.id()).getAncestors());
        assertEquals(List.of(a.id(), b.id()), node(c.id()).getAncestors());
        assertEquals(NodeStatus.TRASHED, node(gone.id()).getStatus()); // a trashed sub-page goes along, still in the trash
        assertTrue(mongo.find(Query.query(Criteria.where("nodeId").is(a.id())), NodeVersion.class).stream()
                .allMatch(v -> other.getId().equals(v.getSpaceId())));
        assertTrue(nodeService.tree(space.getId()).isEmpty());
        assertEquals(List.of("Methodology", "Sampling", "Survey"),
                nodeService.tree(other.getId()).stream().map(NodeSummaryDTO::title).toList());
    }

    @Test
    void movesUnderAPageInOtherSpace() {
        NodeDTO parent = nodeService.create(other.getId(), new CreateNodeRequest(null, "Chapter 3", null));
        NodeDTO a = createPage("Methodology");
        NodeDTO b = child(a, "Sampling");

        nodeService.move(a.id(), new MoveNodeRequest(parent.id(), null, null, other.getId()));

        assertEquals(List.of(parent.id()), node(a.id()).getAncestors());
        assertEquals(List.of(parent.id(), a.id()), node(b.id()).getAncestors());
        assertEquals(other.getId(), node(b.id()).getSpaceId());
    }

    @Test
    void parentMustBeInTheDestinationSpace() {
        NodeDTO here = createPage("Here");
        NodeDTO a = createPage("A");
        assertEquals(400, statusOf(() -> nodeService.move(a.id(), new MoveNodeRequest(here.id(), null, null, other.getId()))));
    }

    @Test
    void notIntoAnotherTeam() {
        Team t2 = new Team();
        t2.setName("Team " + UUID.randomUUID());
        t2 = teams.save(t2);
        Space foreign = teamSpace(t2, "Foreign");
        NodeDTO a = createPage("A");
        assertEquals(400, statusOf(() -> nodeService.move(a.id(), new MoveNodeRequest(null, null, null, foreign.getId()))));
        assertEquals(space.getId(), node(a.id()).getSpaceId());
    }

    @Test
    void notIntoOrOutOfAPrivateSpace() {
        Space mine = spaceService.createPersonalSpace(admin.getId());
        NodeDTO a = createPage("A");
        assertEquals(400, statusOf(() -> nodeService.move(a.id(), new MoveNodeRequest(null, null, null, mine.getId()))));
        NodeDTO p = nodeService.create(mine.getId(), new CreateNodeRequest(null, "Private", null));
        assertEquals(400, statusOf(() -> nodeService.move(p.id(), new MoveNodeRequest(null, null, null, space.getId()))));
    }

    @Test
    void viewerCannotMoveAcrossSpaces() {
        NodeDTO a = createPage("A");
        User viewer = newMember("VIEWER");
        loginAs(viewer);
        assertEquals(403, statusOf(() -> nodeService.move(a.id(), new MoveNodeRequest(null, null, null, other.getId()))));
        assertEquals(space.getId(), node(a.id()).getSpaceId());
    }

    @Test
    void keepsTheRestriction() {
        NodeDTO a = createPage("A");
        Node n = node(a.id());
        Node.Restriction r = new Node.Restriction();
        r.getEditors().add(admin.getId());
        n.setRestriction(r);
        nodes.save(n);

        nodeService.move(a.id(), new MoveNodeRequest(null, null, null, other.getId()));

        assertEquals(List.of(admin.getId()), node(a.id()).getRestriction().getEditors());
    }

    @Test
    void sameSpaceMoveStillWorksWithoutSpaceId() {
        NodeDTO a = createPage("A");
        NodeDTO b = createPage("B");
        nodeService.move(b.id(), new MoveNodeRequest(a.id(), null, null, null));
        assertEquals(List.of(a.id()), node(b.id()).getAncestors());
    }
}
