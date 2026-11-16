package com.knowledgeforge.knowledgeforge.team;

import com.knowledgeforge.knowledgeforge.activity.ActivityLogService;

import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import com.knowledgeforge.knowledgeforge.user.User;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import com.knowledgeforge.knowledgeforge.user.UserRepository;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Optional;

@Service
public class TeamService {

    final TeamRepository teamRepository;
    final UserRepository userRepository;
    final TeamMemberRepository teamMemberRepository;
    final ActivityLogService activity;
    public TeamService(TeamRepository teamRepository, UserRepository userRepository, TeamMemberRepository teamMemberRepository,
                       ActivityLogService activity) {
        this.teamRepository = teamRepository;
        this.userRepository = userRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.activity = activity;
    }

    public Team createTeam(String name, String description) {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();

        Optional<User> userOpt = userRepository.findByEmail(email);

        boolean emailNotInDB = userOpt.isEmpty();

        if(emailNotInDB){
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User Not Found");
        }
        String userId = userOpt.get().getId();
        Team team = new Team();
        team.setName(name);
        team.setDescription(description);
        team.setCreatedAt(new Date());
        team.setCreatedBy(userId);
        team.setUpdatedAt(new Date());
        teamRepository.save(team);

        TeamMember teamMember = new TeamMember();
        teamMember.setTeamId(team.getId());
        teamMember.setRole("ADMIN");
        teamMember.setUserId(userId);
        teamMember.setJoinedAt(new Date());
        teamMemberRepository.save(teamMember);

        return team;


    }

    static final int MAX_NAME = 60, MAX_DESCRIPTION = 280;

    /** QA-63: admins only; a non-member gets 404 so team ids reveal nothing. A new name is logged in the team activity. */
    public Team updateTeam(String teamId, UpdateTeamRequest req) {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        User currentUser = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        TeamMember membership = teamMemberRepository.findByTeamIdAndUserId(teamId, currentUser.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Team Not Found"));
        if (!"ADMIN".equals(membership.getRole())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only a team admin can rename the team");
        }
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Team Not Found"));
        String name = req.teamName() == null ? null : req.teamName().trim();
        if (name != null && (name.isEmpty() || name.codePointCount(0, name.length()) > MAX_NAME)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The team name must be 1 to " + MAX_NAME + " characters");
        }
        String description = req.teamDescription() == null ? null : req.teamDescription().trim();
        if (description != null && description.codePointCount(0, description.length()) > MAX_DESCRIPTION) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The description can be at most " + MAX_DESCRIPTION + " characters");
        }
        boolean renamed = name != null && !name.equals(team.getName());
        if (name != null) team.setName(name);
        if (description != null) team.setDescription(description);
        team.setUpdatedAt(new Date());
        teamRepository.save(team);
        if (renamed) activity.log(teamId, currentUser.getId(), "RENAME_TEAM", "TEAM", teamId, name);
        return team;
    }

    public TeamDetailsResponseDTO getTeamDetails(String teamId) {
        Optional<Team> teamOpt = teamRepository.findById(teamId);
        if (teamOpt.isEmpty()){
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Team Not Found");
        }
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        User currentUser = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        if (!teamMemberRepository.existsByTeamIdAndUserId(teamId, currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You are not a member of this team");
        }
        Team team = teamOpt.get();
        List<TeamMember> teamMembers = teamMemberRepository.findByTeamId(team.getId());
        List<TeamMemberDTO> smallMemberDTOs = new ArrayList<>();
        for (TeamMember teamMember : teamMembers) {
            Optional<User> userOpt = userRepository.findById(teamMember.getUserId());
            if (userOpt.isPresent()){
                User user = userOpt.get();
                TeamMemberDTO MemberDTO = new TeamMemberDTO();
                MemberDTO.setFullName(user.getDisplayName());
                MemberDTO.setEmail(user.getEmail());
                MemberDTO.setRole(teamMember.getRole());
                MemberDTO.setUserId(user.getId());
                smallMemberDTOs.add(MemberDTO);
            }
        }
        TeamDetailsResponseDTO response = new TeamDetailsResponseDTO();
        response.setTeam(team);
        response.setTeamMembers(smallMemberDTOs);
        return  response;
    }

    public void removeMember(String teamId, String userIdToRemove) {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        User currentUser = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        TeamMember currentMembership = teamMemberRepository.findByTeamIdAndUserId(teamId, currentUser.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "You are not a member of this team"));
        if (!currentMembership.getRole().equals("ADMIN")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only an ADMIN can remove members");
        }
        if (currentUser.getId().equals(userIdToRemove)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot remove yourself");
        }
        TeamMember memberToRemove = teamMemberRepository.findByTeamIdAndUserId(teamId, userIdToRemove)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "That user is not a member of this team"));
        teamMemberRepository.delete(memberToRemove);
    }

    public void updateMemberRole(String teamId, String userIdToUpdate, String newRole) {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        User currentUser = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        TeamMember currentMembership = teamMemberRepository
                .findByTeamIdAndUserId(teamId, currentUser.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "You are not a member of this team"));
        if (!"ADMIN".equals(currentMembership.getRole())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only an ADMIN can change roles");
        }
        if (currentUser.getId().equals(userIdToUpdate)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot change your own role");
        }
        if (!"ADMIN".equals(newRole) && !"EDITOR".equals(newRole) && !"VIEWER".equals(newRole)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid role: " + newRole);
        }
        TeamMember targetMembership = teamMemberRepository.findByTeamIdAndUserId(teamId, userIdToUpdate)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "That user is not a member of this team"));
        targetMembership.setRole(newRole);
        teamMemberRepository.save(targetMembership);
    }

}
