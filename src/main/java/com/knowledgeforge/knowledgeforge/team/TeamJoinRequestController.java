package com.knowledgeforge.knowledgeforge.team;

import com.knowledgeforge.knowledgeforge.auth.AuthRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class TeamJoinRequestController {
    private final TeamJoinRequestService teamJoinRequestService;

    private final AuthRateLimiter rateLimiter;

    public TeamJoinRequestController(TeamJoinRequestService teamJoinRequestService, AuthRateLimiter rateLimiter) {
        this.teamJoinRequestService = teamJoinRequestService;
        this.rateLimiter = rateLimiter;
    }

    /** Preview for the join page. 30 per minute per user and per IP, so codes can't be guessed. */
    @GetMapping("/api/team-invites/{inviteCode}")
    public InvitePreviewDTO preview(@PathVariable String inviteCode, Authentication auth, HttpServletRequest request) {
        rateLimiter.check("invite-preview-user", auth.getName(), 30);
        rateLimiter.check("invite-preview-ip", request.getRemoteAddr(), 30);
        return teamJoinRequestService.preview(inviteCode, auth.getName());
    }

    @PostMapping("/api/team-invites/{inviteCode}/join")
    public ResponseEntity<TeamJoinRequest>joinRequest(@PathVariable String inviteCode){
        TeamJoinRequest teamJoinRequest = teamJoinRequestService.requestToJoin(inviteCode);
        return ResponseEntity.status(201).body(teamJoinRequest);
    }

    @GetMapping("/api/teams/{teamId}/join-requests")
    public ResponseEntity<List<TeamJoinRequestDTO>> getTeamJoinRequests(@PathVariable String teamId) {
        return ResponseEntity.status(200).body(teamJoinRequestService.getPendingRequests(teamId));
    }

    @PostMapping("/api/teams/{teamId}/join-requests/{requestId}/accept")
    public ResponseEntity<TeamJoinRequest> acceptRequest(@PathVariable String teamId, @PathVariable String requestId){
        TeamJoinRequest teamJoinRequest = teamJoinRequestService.acceptRequest(teamId, requestId);
        return ResponseEntity.status(200).body(teamJoinRequest);
    }

    @PostMapping("/api/teams/{teamId}/join-requests/{requestId}/reject")
    public ResponseEntity<TeamJoinRequest> rejectRequest(@PathVariable String teamId, @PathVariable String requestId){
        TeamJoinRequest teamJoinRequest = teamJoinRequestService.rejectRequest(teamId, requestId);
        return ResponseEntity.status(200).body(teamJoinRequest);
    }

}
