package com.knowledgeforge.knowledgeforge.team;

import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import com.knowledgeforge.knowledgeforge.user.User;
import com.knowledgeforge.knowledgeforge.user.UserRepository;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

@Service
public class TeamJoinRequestService {
    final TeamJoinRequestRepository teamJoinRequestRepository;
    final  UserRepository userRepository;
    final TeamMemberRepository teamMemberRepository;
    final TeamInviteRepository teamInviteRepository;
    private final TeamRepository teamRepository;

    public TeamJoinRequestService(TeamJoinRequestRepository teamJoinRequestRepository, TeamMemberRepository teamMemberRepository, UserRepository userRepository, TeamInviteRepository teamInviteRepository, TeamRepository teamRepository) {
        this.teamJoinRequestRepository = teamJoinRequestRepository;
        this.userRepository = userRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.teamInviteRepository = teamInviteRepository;
        this.teamRepository = teamRepository;
    }

    /** `email`: the caller, whose own request state the join page shows; null when logged out. */
    public InvitePreviewDTO preview(String inviteCode, String email) {
        TeamInvite invite = teamInviteRepository.findByInviteCode(inviteCode)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invite code not found"));
        Team team = teamRepository.findById(invite.getTeamId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invite code not found"));
        String by = invite.getCreatedBy() == null ? null
                : userRepository.findById(invite.getCreatedBy()).map(User::getFullName).orElse(null);
        String userId = email == null ? null : userRepository.findByEmail(email).map(User::getId).orElse(null);
        boolean pending = userId != null && teamJoinRequestRepository.existsByTeamIdAndUserIdAndStatus(team.getId(), userId, "PENDING");
        boolean member = userId != null && teamMemberRepository.existsByTeamIdAndUserId(team.getId(), userId);
        return new InvitePreviewDTO(team.getName(), teamMemberRepository.countByTeamId(team.getId()), by, pending,
                member, member ? team.getId() : null);
    }

    public TeamJoinRequest requestToJoin(String inviteCode) {
        TeamInvite teamInvite = teamInviteRepository.findByInviteCode(inviteCode)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invite code not found"));
        String teamId = teamInvite.getTeamId();
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        String userId= user.getId();
        boolean exists= teamMemberRepository.existsByTeamIdAndUserId(teamId, userId);
        if(exists){
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You are already a member of this team");
        }
        boolean pending= teamJoinRequestRepository.existsByTeamIdAndUserIdAndStatus(teamId, userId, "PENDING");
        if(pending){
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You are already invited");
        }
        TeamJoinRequest teamJoinRequest = new TeamJoinRequest();
        teamJoinRequest.setTeamId(teamId);
        teamJoinRequest.setUserId(userId);
        teamJoinRequest.setStatus("PENDING");
        teamJoinRequest.setRequestedAt(new Date());
        return teamJoinRequestRepository.save(teamJoinRequest);
    }

    public List<TeamJoinRequestDTO> getPendingRequests(String teamId) {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();

        User adminUser = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));

        TeamMember teamMember = teamMemberRepository.findByTeamIdAndUserId(teamId, adminUser.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "You are not a member of this team"));

        if (!teamMember.getRole().equals("ADMIN")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You are not allowed to view join requests");
        }

        List<TeamJoinRequest> pending = teamJoinRequestRepository.findByTeamIdAndStatus(teamId, "PENDING");

        List<TeamJoinRequestDTO> result = new ArrayList<>();

        for (TeamJoinRequest req : pending) {
            TeamJoinRequestDTO dto = new TeamJoinRequestDTO();
            dto.setId(req.getId());
            dto.setStatus(req.getStatus());
            dto.setRequestedAt(req.getRequestedAt());

            User requester = userRepository.findById(req.getUserId()).orElse(null);
            if (requester != null) {
                dto.setFullName(requester.getFullName());
                dto.setEmail(requester.getEmail());
            } else {
                dto.setFullName("(unknown)");
                dto.setEmail("");
            }

            result.add(dto);
        }

        return result;
    }


    /** role: VIEWER (default) or EDITOR, chosen by the admin on Accept (QA-09). Admins are made on the Members tab. */
    public TeamJoinRequest acceptRequest(String teamId, String requestId, String role) {
        String newRole = role == null ? "VIEWER" : role;
        if (!newRole.equals("VIEWER") && !newRole.equals("EDITOR")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose Viewer or Editor");
        }
        TeamJoinRequest teamJoinRequest = adminFind(teamId, requestId, "PENDING");
        teamJoinRequest.setStatus("ACCEPTED");
        TeamMember teamMember1 = new TeamMember();
        teamMember1.setTeamId(teamId);
        teamMember1.setUserId(teamJoinRequest.getUserId());
        teamMember1.setRole(newRole);
        teamMember1.setJoinedAt(new Date());
        teamMemberRepository.save(teamMember1);
        return  teamJoinRequestRepository.save(teamJoinRequest);
    }

    public TeamJoinRequest rejectRequest(String teamId, String requestId) {
        TeamJoinRequest teamJoinRequest = adminFind(teamId, requestId, "PENDING");
        teamJoinRequest.setStatus("REJECTED");
        return teamJoinRequestRepository.save(teamJoinRequest);
    }

    /** Undo of Decline (QA-06): the declined request is pending again, unless the person asked anew or got in meanwhile. */
    public TeamJoinRequest reopenRequest(String teamId, String requestId) {
        TeamJoinRequest r = adminFind(teamId, requestId, "REJECTED");
        if (teamJoinRequestRepository.existsByTeamIdAndUserIdAndStatus(teamId, r.getUserId(), "PENDING")
                || teamMemberRepository.existsByTeamIdAndUserId(teamId, r.getUserId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "They asked again or joined in the meantime");
        }
        r.setStatus("PENDING");
        return teamJoinRequestRepository.save(r);
    }

    /** The team's request with that id, for an admin of the team, in the given status (else 409). */
    private TeamJoinRequest adminFind(String teamId, String requestId, String status) {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        String role = teamMemberRepository.findByTeamIdAndUserId(teamId, user.getId()).map(TeamMember::getRole).orElse("");
        if (!role.equals("ADMIN")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only admins can answer join requests");
        }
        TeamJoinRequest teamJoinRequest = teamJoinRequestRepository.findById(requestId)
                .filter(r -> teamId.equals(r.getTeamId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Request not found"));
        if (!status.equals(teamJoinRequest.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    status.equals("PENDING") ? "The request is not pending anymore" : "Only a declined request can be undone");
        }
        return teamJoinRequest;
    }
}
