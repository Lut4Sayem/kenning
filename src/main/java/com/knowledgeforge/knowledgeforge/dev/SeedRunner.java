package com.knowledgeforge.knowledgeforge.dev;

import com.knowledgeforge.knowledgeforge.auth.AuthController;
import com.knowledgeforge.knowledgeforge.auth.AuthService;
import com.knowledgeforge.knowledgeforge.common.UserRef;
import com.knowledgeforge.knowledgeforge.node.Node;
import com.knowledgeforge.knowledgeforge.node.RankKeys;
import com.knowledgeforge.knowledgeforge.nodecontent.NodeContent;
import com.knowledgeforge.knowledgeforge.space.Space;
import com.knowledgeforge.knowledgeforge.space.SpaceRepository;
import com.knowledgeforge.knowledgeforge.team.Team;
import com.knowledgeforge.knowledgeforge.team.TeamMember;
import com.knowledgeforge.knowledgeforge.team.TeamMemberRepository;
import com.knowledgeforge.knowledgeforge.team.TeamRepository;
import com.knowledgeforge.knowledgeforge.user.User;
import com.knowledgeforge.knowledgeforge.user.UserRepository;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Date;
import java.util.HexFormat;
import java.util.List;
import java.util.Random;

/**
 * Dev-only data for performance checks: one team, one space and {@code kf.seed.pages} pages (default 10,000) in a
 * 3-level tree. Runs only with {@code --spring.profiles.active=dev --kf.seed=true} and only against a local database.
 */
@Component
@Profile("dev")
@ConditionalOnProperty("kf.seed")
public class SeedRunner implements ApplicationRunner {

    static final String EMAIL = "seed@example.test";
    static final String PASSWORD = "password123";
    private static final String[] WORDS = ("budget roadmap sprint review design api database release meeting notes onboarding "
            + "security backup deploy incident metrics planning retro testing customer feedback analytics queue cache index").split(" ");

    private final MongoTemplate mongo;
    private final AuthService auth;
    private final UserRepository users;
    private final TeamRepository teams;
    private final TeamMemberRepository members;
    private final SpaceRepository spaces;
    private final String uri;
    private final int total;

    public SeedRunner(MongoTemplate mongo, AuthService auth, UserRepository users, TeamRepository teams,
                      TeamMemberRepository members, SpaceRepository spaces,
                      @Value("${spring.mongodb.uri}") String uri, @Value("${kf.seed.pages:10000}") int total) {
        this.mongo = mongo;
        this.auth = auth;
        this.users = users;
        this.teams = teams;
        this.members = members;
        this.spaces = spaces;
        this.uri = uri;
        this.total = total;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        var cs = new com.mongodb.ConnectionString(uri);
        if (uri.startsWith("mongodb+srv") || !cs.getHosts().stream().allMatch(h -> h.startsWith("localhost:") || h.startsWith("127.0.0.1:"))) {
            throw new IllegalStateException("kf.seed only runs against a local database");
        }
        AuthController.RegisterRequest r = new AuthController.RegisterRequest();
        r.setFullName("Seed User");
        r.setEmail(EMAIL);
        r.setPassword(PASSWORD);
        if (users.findByEmail(EMAIL).isPresent()) {
            LoggerFactory.getLogger(SeedRunner.class).info("SEED_SKIPPED already seeded; use a fresh database to seed again");
            return;
        }
        auth.register(r);
        User u = users.findByEmail(EMAIL).orElseThrow();

        Team team = new Team();
        team.setName("Seed team");
        team = teams.save(team);
        TeamMember m = new TeamMember();
        m.setTeamId(team.getId());
        m.setUserId(u.getId());
        m.setRole("ADMIN");
        members.save(m);
        Space space = new Space();
        space.setName("Seed space");
        space.setTeamId(team.getId());
        space.setOwnerType(Space.OwnerType.TEAM);
        space = spaces.save(space);

        UserRef by = new UserRef(u.getId(), u.getFullName(), null);
        Random rnd = new Random(42);
        List<Node> nodes = new ArrayList<>();
        List<NodeContent> contents = new ArrayList<>();
        int made = 0;
        // 10 roots -> 50 children each -> the rest as leaves spread over the children
        List<String> ranks = RankKeys.spread(60); // enough for the widest sibling group
        java.util.Map<String, Integer> childCount = new java.util.HashMap<>();
        List<Node> roots = new ArrayList<>(), mids = new ArrayList<>();
        for (int i = 0; made < total; i++) {
            Node parent = null;
            if (i >= 10) parent = i < 510 ? roots.get((i - 10) % 10) : mids.get((i - 510) % mids.size());
            int slot = childCount.merge(parent == null ? "" : parent.getId(), 1, Integer::sum) - 1;
            Node n = page(space, by, parent, "Page " + i + " " + word(rnd) + " " + word(rnd), ranks.get(slot), i);
            if (i < 10) roots.add(n); else if (i < 510) mids.add(n);
            nodes.add(n);
            contents.add(content(n, rnd));
            made++;
            if (nodes.size() == 500 || made == total) {
                mongo.insertAll(nodes);
                mongo.insertAll(contents);
                nodes.clear();
                contents.clear();
            }
        }
        LoggerFactory.getLogger(SeedRunner.class).info("SEED_DONE pages={} email={} password={} spaceId={} samplePageId={}",
                total, EMAIL, PASSWORD, space.getId(), mids.get(0).getId());
    }

    private static String word(Random rnd) { return WORDS[rnd.nextInt(WORDS.length)]; }

    private Node page(Space space, UserRef by, Node parent, String title, String rank, int i) {
        Node n = new Node();
        n.setId(new org.bson.types.ObjectId().toHexString());
        n.setSpaceId(space.getId());
        n.setParentId(parent == null ? null : parent.getId());
        List<String> anc = new ArrayList<>();
        if (parent != null) { anc.addAll(parent.getAncestors()); anc.add(parent.getId()); }
        n.setAncestors(anc);
        n.setRank(rank);
        n.setTitle(title);
        n.setTags(i % 7 == 0 ? List.of("seed", "tag" + i % 20) : List.of());
        Date now = new Date();
        n.setCreatedBy(by);
        n.setUpdatedBy(by);
        n.setContentUpdatedAt(now);
        n.setCreatedAt(now);
        n.setUpdatedAt(now);
        return n;
    }

    private NodeContent content(Node n, Random rnd) throws Exception {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 300; i++) sb.append(word(rnd)).append(' '); // about 2 KB of text per page
        NodeContent c = new NodeContent();
        c.setId(n.getId());
        c.setSpaceId(n.getSpaceId());
        c.setText(sb.toString());
        c.setContentHash(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(sb.toString().getBytes(StandardCharsets.UTF_8))));
        c.setUpdatedAt(n.getUpdatedAt());
        c.getSearch().setTitle(n.getTitle());
        c.getSearch().setTags(n.getTags());
        return c;
    }
}
