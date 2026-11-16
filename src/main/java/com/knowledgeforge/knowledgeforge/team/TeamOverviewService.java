package com.knowledgeforge.knowledgeforge.team;

import com.knowledgeforge.knowledgeforge.access.Access;
import com.knowledgeforge.knowledgeforge.access.NodeAccessService;
import com.knowledgeforge.knowledgeforge.activity.ActivityLog;
import com.knowledgeforge.knowledgeforge.activity.ActivityLogRepository;
import com.knowledgeforge.knowledgeforge.node.Node;
import com.knowledgeforge.knowledgeforge.node.NodeRepository;
import com.knowledgeforge.knowledgeforge.node.NodeStatus;
import com.knowledgeforge.knowledgeforge.node.PublishState;
import com.knowledgeforge.knowledgeforge.space.Space;
import com.knowledgeforge.knowledgeforge.space.SpaceRepository;
import com.knowledgeforge.knowledgeforge.team.TeamOverviewDTO.*;
import com.knowledgeforge.knowledgeforge.user.User;
import com.knowledgeforge.knowledgeforge.user.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Read models for the team screens. Every number and list comes from ONE visibility pass (the ACTIVE pages of the
 * team's spaces that I can at least read), so the facts row, "View all N pages" and the Pages tab always agree.
 */
@Service
public class TeamOverviewService {

    static final int DEFAULT_SIZE = 25, MAX_SIZE = 100, MAX_ACTIVITY = 20, ACTIVITY_SCAN = 100, FIRST_MEMBERS = 4;

    private final NodeAccessService access;
    private final TeamRepository teams;
    private final TeamMemberRepository members;
    private final SpaceRepository spaces;
    private final NodeRepository nodes;
    private final UserRepository users;
    private static final String TEAM = "TEAM";
    private final ActivityLogRepository activity;

    public TeamOverviewService(NodeAccessService access, TeamRepository teams, TeamMemberRepository members,
                               SpaceRepository spaces, NodeRepository nodes, UserRepository users,
                               ActivityLogRepository activity) {
        this.access = access;
        this.teams = teams;
        this.members = members;
        this.spaces = spaces;
        this.nodes = nodes;
        this.users = users;
        this.activity = activity;
    }

    /** What one team screen request sees: my membership, the spaces, and the readable ACTIVE pages per space. */
    private record View(Team team, TeamMember me, List<Space> spaces, Map<String, List<Node>> pagesBySpace) {
        List<Node> allPages() {
            return pagesBySpace.values().stream().flatMap(List::stream).toList();
        }
    }

    // shortcut: loads every ACTIVE page of the team's spaces and filters/sorts/pages in memory; fine for student
    // teams (hundreds of pages), move to an indexed query with a visibility pre-filter if a team grows past a few thousand.
    private View view(String teamId) {
        User user = access.currentUser();
        Team team = teams.findById(teamId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Team not found"));
        TeamMember me = members.findByTeamIdAndUserId(teamId, user.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "You are not a member of this team"));
        List<Space> teamSpaces = spaces.findByTeamId(teamId);
        Map<String, List<Node>> bySpace = new LinkedHashMap<>();
        for (Space s : teamSpaces) {
            List<Node> all = nodes.findBySpaceIdAndStatusOrderByParentIdAscRankAsc(s.getId(), NodeStatus.ACTIVE);
            Map<String, Access> acc = access.resolveAll(user.getId(), s, all);
            bySpace.put(s.getId(), all.stream().filter(n -> acc.get(n.getId()).compareTo(Access.VIEW) >= 0).toList());
        }
        return new View(team, me, teamSpaces, bySpace);
    }

    public TeamOverviewDTO.Summary summary(String teamId) {
        View v = view(teamId);
        List<TeamMember> all = members.findByTeamId(teamId);
        Map<String, User> byId = users.findAllById(all.stream().map(TeamMember::getUserId).toList()).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));
        List<FirstMember> first = all.stream().filter(m -> byId.containsKey(m.getUserId())).limit(FIRST_MEMBERS)
                .map(m -> new FirstMember(m.getUserId(), byId.get(m.getUserId()).getDisplayName(), m.getRole())).toList();
        List<Node> pages = v.allPages();
        // Team.updatedAt is only set when the team is created, so "updated" is the newest visible page, else the team.
        Date updated = pages.stream().map(Node::getUpdatedAt).filter(Objects::nonNull).max(Date::compareTo)
                .orElse(v.team().getUpdatedAt());
        return new TeamOverviewDTO.Summary(v.team().getName(), v.team().getDescription(), all.size(), v.spaces().size(),
                pages.size(), v.me().getRole(), updated, first);
    }

    public List<SpaceItem> spaces(String teamId) {
        View v = view(teamId);
        return v.spaces().stream().map(s -> {
            List<Node> p = v.pagesBySpace().get(s.getId());
            int drafts = (int) p.stream().filter(n -> n.getPublishState() == PublishState.DRAFT).count();
            return new SpaceItem(s.getId(), s.getName(), s.getDescription(), s.getIcon(), p.size(), drafts);
        }).toList();
    }

    public TeamOverviewDTO.Pages pages(String teamId, String status, String spaceId, String editedBy, String sort,
                                       Integer page, Integer size) {
        PublishState state = null;
        if (status != null && !status.isBlank()) {
            try {
                state = PublishState.valueOf(status.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status: " + status);
            }
        }
        String order = sort == null || sort.isBlank() ? "updated" : sort;
        if (!order.equals("updated") && !order.equals("title")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid sort: " + sort);
        int pageNo = page == null ? 0 : page;
        int pageSize = size == null ? DEFAULT_SIZE : size;
        if (pageNo < 0 || pageSize < 1 || pageSize > MAX_SIZE) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "page must be 0 or more, size 1 to " + MAX_SIZE);

        View v = view(teamId);
        Map<String, Space> spaceById = v.spaces().stream().collect(Collectors.toMap(Space::getId, Function.identity()));
        Map<String, String> titleById = new HashMap<>();
        v.allPages().forEach(n -> titleById.put(n.getId(), n.getTitle()));

        final PublishState want = state;
        Comparator<Node> cmp = order.equals("title")
                ? Comparator.comparing((Node n) -> n.getTitle() == null ? "" : n.getTitle().toLowerCase(Locale.ROOT))
                : Comparator.comparing(Node::getUpdatedAt, Comparator.nullsFirst(Comparator.naturalOrder())).reversed();
        List<Node> matches = v.allPages().stream()
                .filter(n -> spaceId == null || spaceId.isBlank() || spaceId.equals(n.getSpaceId()))
                .filter(n -> want == null || n.getPublishState() == want)
                .filter(n -> editedBy == null || editedBy.isBlank() || (n.getUpdatedBy() != null && editedBy.equals(n.getUpdatedBy().getUserId())))
                .sorted(cmp).toList();
        int from = Math.min(pageNo * pageSize, matches.size());
        List<PageItem> items = matches.subList(from, Math.min(from + pageSize, matches.size())).stream().map(n -> new PageItem(
                n.getId(), n.getTitle(), n.getSpaceId(), spaceById.get(n.getSpaceId()).getName(), n.getPublishState(),
                n.getUpdatedBy() == null ? null : n.getUpdatedBy().getName(), n.getUpdatedBy() == null ? null : n.getUpdatedBy().getUserId(),
                n.getUpdatedAt(), n.getParentId() == null ? null : titleById.get(n.getParentId()), n.getColor())).toList();
        return new TeamOverviewDTO.Pages(items, matches.size());
    }

    /** Newest events about pages I can still see (trashed pages count, purged ones are gone). */
    public List<ActivityItem> activity(String teamId, Integer limitParam) {
        int limit = limitParam == null ? 5 : limitParam;
        if (limit < 1 || limit > MAX_ACTIVITY) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be 1 to " + MAX_ACTIVITY);
        View v = view(teamId);
        List<ActivityLog> logs = activity.findByTeamIdOrderByCreatedAtDesc(teamId, PageRequest.of(0, ACTIVITY_SCAN));
        if (logs.isEmpty()) return List.of();

        Map<String, Node> targets = nodes.findAllById(logs.stream().map(ActivityLog::getTargetId).filter(Objects::nonNull).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(Node::getId, Function.identity()));
        // Ancestors go in too: resolveAll only sees the restrictions of the nodes it is given.
        Map<String, Node> pool = new HashMap<>();
        nodes.findAllById(targets.values().stream().flatMap(n -> n.getAncestors().stream()).collect(Collectors.toSet())).forEach(a -> pool.put(a.getId(), a));
        pool.putAll(targets);
        String me = v.me().getUserId();
        Map<String, Access> acc = new HashMap<>();
        for (Space s : v.spaces()) {
            acc.putAll(access.resolveAll(me, s, pool.values().stream().filter(n -> s.getId().equals(n.getSpaceId())).toList(), true));
        }
        List<ActivityLog> shown = logs.stream()
                .filter(l -> TEAM.equals(l.getTargetType())
                        || targets.containsKey(l.getTargetId()) && acc.getOrDefault(l.getTargetId(), Access.NONE).compareTo(Access.VIEW) >= 0)
                .limit(limit).toList();
        Map<String, String> names = users.findAllById(shown.stream().map(ActivityLog::getUserId).filter(Objects::nonNull).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(User::getId, User::getFullName));
        // Team events (a rename) are for every member and keep the title they were logged with; page events show today's title.
        return shown.stream().map(l -> new ActivityItem(names.get(l.getUserId()), l.getAction(),
                TEAM.equals(l.getTargetType()) ? l.getTargetTitle() : targets.get(l.getTargetId()).getTitle(),
                l.getTargetId(), l.getCreatedAt())).toList();
    }
}
