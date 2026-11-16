package com.knowledgeforge.knowledgeforge.node;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class TrashController {
    private final TrashService trash;

    public TrashController(TrashService trash) {
        this.trash = trash;
    }

    @GetMapping("/api/nodes/{id}/subtree-count")
    public CountDTO subtreeCount(@PathVariable String id) {
        return trash.subtreeCount(id);
    }

    @PostMapping("/api/nodes/{id}/trash")
    public CountDTO trash(@PathVariable String id) {
        return trash.trash(id);
    }

    @PostMapping("/api/nodes/{id}/archive")
    public CountDTO archive(@PathVariable String id) {
        return trash.archive(id);
    }

    @PostMapping("/api/nodes/{id}/unarchive")
    public RestoreDTO unarchive(@PathVariable String id) {
        return trash.unarchive(id);
    }

    @GetMapping("/api/spaces/{spaceId}/trash")
    public BranchListDTO trashList(@PathVariable String spaceId) {
        return trash.trashList(spaceId);
    }

    @GetMapping("/api/spaces/{spaceId}/archived")
    public BranchListDTO archivedList(@PathVariable String spaceId) {
        return trash.archivedList(spaceId);
    }

    @GetMapping("/api/nodes/{id}/trashed")
    public TrashedDTO trashed(@PathVariable String id) {
        return trash.trashed(id);
    }

    @GetMapping("/api/teams/{teamId}/trash")
    public java.util.List<SpaceBranchesDTO> teamTrash(@PathVariable String teamId) {
        return trash.teamTrash(teamId);
    }

    @GetMapping("/api/teams/{teamId}/archived")
    public java.util.List<SpaceBranchesDTO> teamArchived(@PathVariable String teamId) {
        return trash.teamArchived(teamId);
    }

    @PostMapping("/api/trash/{trashRootId}/restore")
    public RestoreDTO restore(@PathVariable String trashRootId) {
        return trash.restore(trashRootId);
    }

    @DeleteMapping("/api/trash/{trashRootId}")
    public ResponseEntity<Void> deleteForever(@PathVariable String trashRootId) {
        trash.deleteForever(trashRootId);
        return ResponseEntity.noContent().build();
    }
}
