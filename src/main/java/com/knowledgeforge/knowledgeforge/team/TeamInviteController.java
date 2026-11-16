package com.knowledgeforge.knowledgeforge.team;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** The team's invite link (admins). One per team: POST replaces it, DELETE turns it off (QA-03). */
@RestController
public class TeamInviteController {
    private final TeamInviteService teamInviteService;
    public TeamInviteController(TeamInviteService teamInviteService){
        this.teamInviteService = teamInviteService;
    }

    @GetMapping("/api/teams/{teamId}/invite")
    public ResponseEntity<InviteLinkDTO> currentInvite(@PathVariable String teamId) {
        return teamInviteService.currentInvite(teamId).map(ResponseEntity::ok).orElse(ResponseEntity.noContent().build());
    }

    @PostMapping("/api/teams/{teamId}/invite")
    public ResponseEntity<InviteLinkDTO> createTeamInvite(@PathVariable String teamId){
        return ResponseEntity.status(201).body(teamInviteService.createTeamInvite(teamId));
    }

    @DeleteMapping("/api/teams/{teamId}/invite")
    public ResponseEntity<Void> turnOffInvite(@PathVariable String teamId) {
        teamInviteService.turnOffInvite(teamId);
        return ResponseEntity.noContent().build();
    }
}
