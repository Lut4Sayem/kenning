package com.knowledgeforge.knowledgeforge.team;

import org.springframework.data.mongodb.core.FindAndReplaceOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import com.knowledgeforge.knowledgeforge.user.User;
import com.knowledgeforge.knowledgeforge.user.UserRepository;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/** One invite link per team (QA-03). A replaced or turned-off code is deleted, so preview and join answer 404. */
@Service
public class TeamInviteService {
    final TeamInviteRepository teamInviteRepository;
    final UserRepository userRepository;
    final TeamMemberRepository teamMemberRepository;
    private final MongoTemplate mongo;

    public TeamInviteService(UserRepository userRepository, TeamMemberRepository teamMemberRepository,
                             TeamInviteRepository teamInviteRepository, MongoTemplate mongo) {
        this.userRepository = userRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.teamInviteRepository = teamInviteRepository;
        this.mongo = mongo;
    }

    public Optional<InviteLinkDTO> currentInvite(String teamId) {
        requireAdmin(teamId);
        return teamInviteRepository.findByTeamId(teamId).map(this::toDto);
    }

    public InviteLinkDTO createTeamInvite(String teamId){
        String userId = requireAdmin(teamId);
        TeamInvite teamInvite = new TeamInvite();
        teamInvite.setTeamId(teamId);
        teamInvite.setCreatedAt(new Date());
        teamInvite.setCreatedBy(userId);
        teamInvite.setInviteCode(UUID.randomUUID().toString());
        // One atomic upsert on the unique teamId: the old code is gone the moment the new one exists.
        TeamInvite saved = mongo.findAndReplace(Query.query(Criteria.where("teamId").is(teamId)), teamInvite,
                FindAndReplaceOptions.options().upsert().returnNew());
        return toDto(saved);
    }

    public void turnOffInvite(String teamId) {
        requireAdmin(teamId);
        teamInviteRepository.deleteByTeamId(teamId);
    }

    private InviteLinkDTO toDto(TeamInvite i) {
        String by = i.getCreatedBy() == null ? null : userRepository.findById(i.getCreatedBy()).map(User::getFullName).orElse(null);
        return new InviteLinkDTO(i.getInviteCode(), i.getCreatedAt(), by);
    }

    /** Returns the caller's user id. */
    private String requireAdmin(String teamId) {
        String email= SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        TeamMember member = teamMemberRepository.findByTeamIdAndUserId(teamId, user.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "User is not part of the team"));
        if(!(Objects.equals(member.getRole(), "ADMIN"))){
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only admins can manage the invite link");
        }
        return user.getId();
    }
}
