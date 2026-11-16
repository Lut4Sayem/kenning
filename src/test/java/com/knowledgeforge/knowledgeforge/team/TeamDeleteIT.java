package com.knowledgeforge.knowledgeforge.team;

import com.knowledgeforge.knowledgeforge.activity.ActivityLog;
import com.knowledgeforge.knowledgeforge.ai.AiAnswer;
import com.knowledgeforge.knowledgeforge.ai.AiSummary;
import com.knowledgeforge.knowledgeforge.attachment.Attachment;
import com.knowledgeforge.knowledgeforge.attachment.AttachmentStorageService;
import com.knowledgeforge.knowledgeforge.comment.Comment;
import com.knowledgeforge.knowledgeforge.common.UserRef;
import com.knowledgeforge.knowledgeforge.editlock.EditLock;
import com.knowledgeforge.knowledgeforge.node.CreateNodeRequest;
import com.knowledgeforge.knowledgeforge.node.Node;
import com.knowledgeforge.knowledgeforge.node.NodeDTO;
import com.knowledgeforge.knowledgeforge.node.TrashService;
import com.knowledgeforge.knowledgeforge.nodecontent.NodeContent;
import com.knowledgeforge.knowledgeforge.nodeversion.NodeVersion;
import com.knowledgeforge.knowledgeforge.nodeversion.VersionKind;
import com.knowledgeforge.knowledgeforge.space.Space;
import com.knowledgeforge.knowledgeforge.support.NodeIntegrationTest;
import com.knowledgeforge.knowledgeforge.user.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayInputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** QA-67: an admin deletes a team and everything it owns; nobody else can, and other teams keep their data. */
class TeamDeleteIT extends NodeIntegrationTest {
    @Autowired TeamService teamService;
    @Autowired TrashService trash;
    @Autowired TeamInviteService invites;
    @Autowired AttachmentStorageService storage;

    /** Every page, file and team-level row that should go with the team, seeded in all states. */
    private record Seeded(List<String> nodeIds, List<String> spaceIds, List<String> fileIds) {
    }

    private Seeded seedTeam(Team t, Space first, User owner) {
        loginAs(owner);
        Space second = new Space();
        second.setName("Second");
        second.setTeamId(t.getId());
        second.setOwnerType(Space.OwnerType.TEAM);
        second = spaces.save(second);

        List<String> ids = new ArrayList<>(), files = new ArrayList<>();
        NodeDTO live = nodeService.create(first.getId(), new CreateNodeRequest(null, "Live", null));
        NodeDTO kid = nodeService.create(first.getId(), new CreateNodeRequest(live.id(), "Kid", null));
        NodeDTO binned = nodeService.create(first.getId(), new CreateNodeRequest(null, "Binned", null));
        NodeDTO shelved = nodeService.create(second.getId(), new CreateNodeRequest(null, "Shelved", null));
        trash.trash(binned.id());
        trash.archive(shelved.id());
        for (NodeDTO n : List.of(live, kid, binned, shelved)) {
            ids.add(n.id());
            files.add(seedPage(n.id(), owner));
        }
        nodeService.get(live.id()); // puts it in the owner's recent list
        for (String sp : List.of(first.getId(), second.getId())) {
            AiAnswer a = new AiAnswer();
            a.setSpaceId(sp);
            a.setQuestionKey("q");
            a.setFingerprint("f");
            a.setAnswer("a");
            a.setCreatedAt(new Date());
            mongo.insert(a);
        }
        TeamJoinRequest jr = new TeamJoinRequest();
        jr.setTeamId(t.getId());
        jr.setUserId(newUser().getId());
        jr.setStatus("PENDING");
        jr.setRequestedAt(new Date());
        mongo.insert(jr);
        loginAs(owner);
        invites.createTeamInvite(t.getId());
        return new Seeded(ids, List.of(first.getId(), second.getId()), files);
    }

    private String seedPage(String nodeId, User u) {
        Date now = new Date();
        NodeVersion v = new NodeVersion();
        v.setNodeId(nodeId);
        v.setSpaceId(nodes(nodeId).getSpaceId());
        v.setKind(VersionKind.AUTO);
        v.setTitle("t");
        v.setState(new byte[]{1});
        v.setText("t");
        v.setContentHash("h");
        v.setAuthors(List.of(new UserRef(u.getId(), "x", null)));
        v.setCreatedAt(now);
        v.setUpdatedAt(now);
        mongo.insert(v);
        Comment c = new Comment();
        c.setNodeId(nodeId);
        c.setContent("hi");
        c.setCreatedBy(u.getId());
        c.setCreatedAt(now);
        mongo.insert(c);
        String fileId = storage.store(new ByteArrayInputStream(new byte[]{9}), "text/plain");
        Attachment a = new Attachment();
        a.setNodeId(nodeId);
        a.setOriginalName("f.txt");
        a.setFileId(fileId);
        a.setContentType("text/plain");
        a.setSize(1L);
        a.setUploadedBy(u.getId());
        a.setUploadedAt(now);
        mongo.insert(a);
        EditLock l = new EditLock();
        l.setId(nodeId);
        l.setHolder(new UserRef(u.getId(), "x", null));
        l.setExpiresAt(Date.from(Instant.now().plusSeconds(600)));
        mongo.insert(l);
        AiSummary s = new AiSummary();
        s.setNodeId(nodeId);
        s.setSummary("sum");
        s.setContentUpdatedAt(now);
        s.setCreatedAt(now);
        mongo.insert(s);
        return fileId;
    }

    private Node nodes(String id) {
        return mongo.findById(id, Node.class);
    }

    /** Rows anywhere that still belong to the team. */
    private long leftovers(String teamId, Seeded s) {
        Query byNode = Query.query(Criteria.where("nodeId").in(s.nodeIds()));
        Query byId = Query.query(Criteria.where("id").in(s.nodeIds()));
        Query byTeam = Query.query(Criteria.where("teamId").is(teamId));
        long n = 0;
        n += mongo.count(Query.query(Criteria.where("id").is(teamId)), Team.class);
        n += mongo.count(byTeam, Space.class);
        n += mongo.count(byTeam, TeamMember.class);
        n += mongo.count(byTeam, TeamInvite.class);
        n += mongo.count(byTeam, TeamJoinRequest.class);
        n += mongo.count(byTeam, ActivityLog.class);
        n += mongo.count(Query.query(Criteria.where("spaceId").in(s.spaceIds())), Node.class);
        n += mongo.count(byId, Node.class);
        n += mongo.count(byId, NodeContent.class);
        n += mongo.count(byId, EditLock.class);
        n += mongo.count(byNode, NodeVersion.class);
        n += mongo.count(byNode, Comment.class);
        n += mongo.count(byNode, Attachment.class);
        n += mongo.count(byNode, AiSummary.class);
        n += mongo.count(Query.query(Criteria.where("spaceId").in(s.spaceIds())), AiAnswer.class);
        for (String id : s.nodeIds()) {
            n += mongo.count(Query.query(Criteria.where("recentNodes.nodeId").is(new org.bson.types.ObjectId(id))), User.class);
        }
        for (String f : s.fileIds()) {
            try {
                storage.load(f);
                n++;
            } catch (ResponseStatusException gone) {
                // deleted, as it should be
            }
        }
        return n;
    }

    @Test
    void adminDeletesTheTeamAndNothingOfItIsLeft() {
        Seeded mine = seedTeam(team, space, admin);

        // another team with the same kinds of data, which must survive
        User other = newUser();
        loginAs(other);
        Team otherTeam = teamService.createTeam("Other " + UUID.randomUUID(), null);
        Space otherSpace = new Space();
        otherSpace.setName("Theirs");
        otherSpace.setTeamId(otherTeam.getId());
        otherSpace.setOwnerType(Space.OwnerType.TEAM);
        otherSpace = spaces.save(otherSpace);
        Seeded theirs = seedTeam(otherTeam, otherSpace, other);
        long theirsBefore = leftovers(otherTeam.getId(), theirs);

        loginAs(admin);
        assertTrue(leftovers(team.getId(), mine) > 20, "seed must exist before the delete");
        teamService.deleteTeam(team.getId(), team.getName());

        assertEquals(0, leftovers(team.getId(), mine));
        assertEquals(theirsBefore, leftovers(otherTeam.getId(), theirs));
        assertTrue(users.findById(admin.getId()).isPresent(), "the people stay");
    }

    @Test
    void onlyAdminsWithTheExactName() {
        User editor = newMember("EDITOR");
        User viewer = newMember("VIEWER");
        loginAs(editor);
        assertEquals(403, statusOf(() -> teamService.deleteTeam(team.getId(), team.getName())));
        loginAs(viewer);
        assertEquals(403, statusOf(() -> teamService.deleteTeam(team.getId(), team.getName())));
        loginAs(newUser());
        assertEquals(404, statusOf(() -> teamService.deleteTeam(team.getId(), team.getName())));
        loginAs(admin);
        assertEquals(400, statusOf(() -> teamService.deleteTeam(team.getId(), team.getName().toUpperCase())));
        assertEquals(400, statusOf(() -> teamService.deleteTeam(team.getId(), " " + team.getName())));
        assertEquals(400, statusOf(() -> teamService.deleteTeam(team.getId(), null)));
        assertTrue(teams.existsById(team.getId()));
        assertTrue(spaces.existsById(space.getId()));
    }
}
