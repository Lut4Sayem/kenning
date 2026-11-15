package com.knowledgeforge.knowledgeforge.dashboard;

import java.util.Date;
import java.util.List;

/** My drafts for Home: the newest {@code items}, and how many I have in all (capped, see DraftsService). */
public record DraftsDTO(List<Draft> items, int total) {
    /** teamName is null for a page in my personal space. */
    public record Draft(String nodeId, String title, String spaceId, String spaceName, String teamName, Date updatedAt) {
    }
}
