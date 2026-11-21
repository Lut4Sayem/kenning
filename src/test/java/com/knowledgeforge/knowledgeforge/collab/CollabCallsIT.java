package com.knowledgeforge.knowledgeforge.collab;

import com.knowledgeforge.knowledgeforge.node.CreateNodeRequest;
import com.knowledgeforge.knowledgeforge.node.NodeDTO;
import com.knowledgeforge.knowledgeforge.node.TrashService;
import com.knowledgeforge.knowledgeforge.nodecontent.NodeContent;
import com.knowledgeforge.knowledgeforge.nodeversion.NodeVersion;
import com.knowledgeforge.knowledgeforge.nodeversion.NodeVersionService;
import com.knowledgeforge.knowledgeforge.nodeversion.VersionSummaryDTO;
import com.knowledgeforge.knowledgeforge.support.NodeIntegrationTest;
import com.knowledgeforge.knowledgeforge.team.TeamService;
import com.knowledgeforge.knowledgeforge.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** Spring tells the collaboration service whenever what it holds may be wrong: restore, access changes, versions. */
class CollabCallsIT extends NodeIntegrationTest {
    @MockitoBean CollabClient collab;
    @Autowired NodeVersionService versions;
    @Autowired TeamService teams;
    @Autowired TrashService trash;

    private static String b64(String s) {
        return Base64.getEncoder().encodeToString(s.getBytes(StandardCharsets.UTF_8));
    }

    private long versionsOf(String nodeId) {
        return mongo.count(Query.query(Criteria.where("nodeId").is(nodeId)), NodeVersion.class);
    }

    @BeforeEach
    void collabAnswers() {
        when(collab.flush(anyString())).thenReturn(true);
    }

    @Test
    void restoreCallsCollabReset() {
        NodeDTO p = createPage("A");
        store(p.id(), 0, b64("v1"), "v1");
        VersionSummaryDTO v1 = versions.name(p.id(), "first");
        store(p.id(), 1, b64("v2"), "v2");
        AtomicLong epochAtReset = new AtomicLong(-1);
        doAnswer(inv -> {
            epochAtReset.set(mongo.findById(p.id(), NodeContent.class).getContentEpoch());
            return null;
        }).when(collab).reset(p.id());

        versions.restore(v1.id());

        verify(collab).reset(p.id());
        assertEquals(1, epochAtReset.get()); // only after the new epoch is stored: a late store is refused
    }

    @Test
    void memberRemovalCallsRevalidate() {
        User m = newMember("EDITOR");
        teams.removeMember(team.getId(), m.getId());
        verify(collab).revalidateUser(m.getId());
    }

    @Test
    void roleChangeCallsRevalidate() {
        User m = newMember("EDITOR");
        teams.updateMemberRole(team.getId(), m.getId(), "VIEWER");
        verify(collab).revalidateUser(m.getId());
    }

    @Test
    void lockCallsRevalidate() {
        NodeDTO p = createPage("A");
        nodeService.lock(p.id());
        nodeService.unlock(p.id());
        verify(collab, times(2)).revalidate(List.of(p.id()));
    }

    @Test
    @SuppressWarnings("unchecked")
    void trashCallsRevalidateForBranch() {
        NodeDTO parent = createPage("Parent");
        NodeDTO child = nodeService.create(space.getId(), new CreateNodeRequest(parent.id(), "Child", null));
        trash.trash(parent.id());
        ArgumentCaptor<Collection<String>> ids = ArgumentCaptor.forClass(Collection.class);
        verify(collab).revalidate(ids.capture());
        assertEquals(List.of(parent.id(), child.id()).stream().sorted().toList(), ids.getValue().stream().sorted().toList());
    }

    @Test
    void namedVersionFlushesFirst() {
        NodeDTO p = createPage("A");
        store(p.id(), 0, b64("v1"), "v1");
        AtomicLong versionsAtFlush = new AtomicLong(-1);
        when(collab.flush(p.id())).thenAnswer(inv -> {
            versionsAtFlush.set(versionsOf(p.id()));
            return true;
        });
        assertFalse(versions.name(p.id(), "before the meeting").liveEditsMissing());
        assertEquals(0, versionsAtFlush.get()); // flushed before the version was taken

        when(collab.flush(p.id())).thenReturn(false); // collab down: the version is still made, and says so
        store(p.id(), 1, b64("v2"), "v2");
        VersionSummaryDTO second = versions.name(p.id(), "after");
        assertTrue(second.liveEditsMissing());
        assertEquals(2, versionsOf(p.id()));
    }

    @Test
    void publishFlushesFirst() {
        NodeDTO p = createPage("A");
        nodeService.publish(p.id());
        verify(collab).flush(p.id());
    }
}
