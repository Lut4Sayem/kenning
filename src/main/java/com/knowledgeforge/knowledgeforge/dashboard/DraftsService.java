package com.knowledgeforge.knowledgeforge.dashboard;

import com.knowledgeforge.knowledgeforge.access.Access;
import com.knowledgeforge.knowledgeforge.access.NodeAccessService;
import com.knowledgeforge.knowledgeforge.node.Node;
import com.knowledgeforge.knowledgeforge.node.NodeRepository;
import com.knowledgeforge.knowledgeforge.node.NodeStatus;
import com.knowledgeforge.knowledgeforge.node.PublishState;
import com.knowledgeforge.knowledgeforge.space.Space;
import com.knowledgeforge.knowledgeforge.space.SpaceRepository;
import com.knowledgeforge.knowledgeforge.team.TeamRepository;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Pages I can edit that are still drafts and that I created or last edited (Home, "Your drafts"). */
@Service
public class DraftsService {

    static final int DEFAULT_LIMIT = 5, MAX_LIMIT = 50;
    /** shortcut: the total counts at most this many candidates; raise it or add a count query if anyone has more drafts. */
    static final int CANDIDATES = 200;

    private final MongoTemplate mongo;
    private final NodeAccessService access;
    private final NodeRepository nodes;
    private final SpaceRepository spaces;
    private final TeamRepository teams;

    public DraftsService(MongoTemplate mongo, NodeAccessService access, NodeRepository nodes,
                         SpaceRepository spaces, TeamRepository teams) {
        this.mongo = mongo;
        this.access = access;
        this.nodes = nodes;
        this.spaces = spaces;
        this.teams = teams;
    }

    public DraftsDTO drafts(Integer limitParam) {
        int limit = limitParam == null ? DEFAULT_LIMIT : limitParam;
        if (limit < 1 || limit > MAX_LIMIT) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be 1 to " + MAX_LIMIT);
        String me = access.currentUser().getId();

        // Mapped paths: createdBy/updatedBy ids are stored as ObjectIds. Each branch of the $or has its own index.
        Query q = new Query(new Criteria().andOperator(
                Criteria.where("status").is(NodeStatus.ACTIVE),
                Criteria.where("publishState").is(PublishState.DRAFT),
                new Criteria().orOperator(Criteria.where("createdBy.userId").is(me), Criteria.where("updatedBy.userId").is(me))))
                .with(Sort.by(Sort.Direction.DESC, "updatedAt")).limit(CANDIDATES);
        List<Node> found = mongo.find(q, Node.class);
        if (found.isEmpty()) return new DraftsDTO(List.of(), 0);

        Map<String, Space> spaceById = spaces.findAllById(found.stream().map(Node::getSpaceId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(Space::getId, Function.identity()));
        // resolveAll only sees restrictions on the nodes it is given, so the ancestors go in too.
        Map<String, Node> withAncestors = new HashMap<>();
        nodes.findAllById(found.stream().flatMap(n -> n.getAncestors().stream()).collect(Collectors.toSet()))
                .forEach(a -> withAncestors.put(a.getId(), a));
        found.forEach(n -> withAncestors.put(n.getId(), n));

        Map<String, Access> resolved = new HashMap<>();
        for (Space s : spaceById.values()) {
            try {
                resolved.putAll(access.resolveAll(me, s,
                        withAncestors.values().stream().filter(x -> x.getSpaceId().equals(s.getId())).toList()));
            } catch (ResponseStatusException gone) {
                // I left that team: its pages are not mine to list any more
            }
        }
        List<Node> mine = found.stream()
                .filter(n -> resolved.getOrDefault(n.getId(), Access.NONE).compareTo(Access.EDIT) >= 0).toList();

        List<Node> shown = mine.subList(0, Math.min(limit, mine.size()));
        Map<String, String> teamNames = new HashMap<>();
        teams.findAllById(shown.stream().map(n -> spaceById.get(n.getSpaceId()).getTeamId()).filter(Objects::nonNull)
                .collect(Collectors.toSet())).forEach(t -> teamNames.put(t.getId(), t.getName()));
        List<DraftsDTO.Draft> items = shown.stream().map(n -> {
            Space s = spaceById.get(n.getSpaceId());
            return new DraftsDTO.Draft(n.getId(), n.getTitle(), s.getId(), s.getName(),
                    s.getTeamId() == null ? null : teamNames.get(s.getTeamId()), n.getUpdatedAt());
        }).toList();
        return new DraftsDTO(items, mine.size());
    }
}
