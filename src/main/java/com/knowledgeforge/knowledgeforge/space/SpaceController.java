package com.knowledgeforge.knowledgeforge.space;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
public class SpaceController {
    private final SpaceService spaceService;
    private final com.knowledgeforge.knowledgeforge.team.TeamOverviewService overview;

    public SpaceController(SpaceService spaceService, com.knowledgeforge.knowledgeforge.team.TeamOverviewService overview) {
        this.spaceService = spaceService;
        this.overview = overview;
    }

    @PostMapping("/api/teams/{teamId}/spaces")
    public ResponseEntity<Space> createSpace(@PathVariable String teamId, @RequestBody CreateSpaceRequest request){
        Space body = spaceService.createSpace(teamId, request);
        return ResponseEntity.status(201).body(body);
    }

    @GetMapping("/api/teams/{teamId}/spaces")
    public ResponseEntity<List<com.knowledgeforge.knowledgeforge.team.TeamOverviewDTO.SpaceItem>> getSpace(@PathVariable String teamId){
        return ResponseEntity.status(200).body(overview.spaces(teamId));
    }

    @GetMapping("/api/me/spaces")
    public ResponseEntity<List<MySpaceDTO>> getMySpaces(){
        return ResponseEntity.ok(spaceService.getMySpaces());
    }

    @PatchMapping("/api/spaces/{spaceId}")
    public ResponseEntity<Space> renameSpace(@PathVariable String spaceId, @RequestBody RenameSpaceRequest request) {
        return ResponseEntity.ok(spaceService.renameSpace(spaceId, request));
    }
}
