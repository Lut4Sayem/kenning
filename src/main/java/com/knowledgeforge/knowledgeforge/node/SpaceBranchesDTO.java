package com.knowledgeforge.knowledgeforge.node;

import java.util.List;

/** One space's trashed or archived branches in the team trash (QA-34); same rows as the space trash. */
public record SpaceBranchesDTO(String spaceId, String spaceName, boolean canPurge, List<BranchDTO> items) {
}
