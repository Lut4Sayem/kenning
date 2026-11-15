package com.knowledgeforge.knowledgeforge.team;

import com.knowledgeforge.knowledgeforge.node.PublishState;

import java.util.Date;
import java.util.List;

/** Response shapes of the team overview, pages list and activity endpoints (DP-4). */
public final class TeamOverviewDTO {
    private TeamOverviewDTO() {
    }

    public record FirstMember(String userId, String fullName, String role) {
    }

    /** pageCount counts only pages I can see (title-only pages are left out). */
    public record Summary(String name, String description, int memberCount, int spaceCount, int pageCount, String myRole,
                          Date updatedAt, List<FirstMember> firstMembers) {
    }

    public record PageItem(String id, String title, String spaceId, String spaceName, PublishState publishState,
                           String lastEditorName, String lastEditorId, Date updatedAt, String parentTitle) {
    }

    public record Pages(List<PageItem> items, int total) {
    }

    public record ActivityItem(String actorName, String action, String targetTitle, String targetId, Date createdAt) {
    }

    public record SpaceItem(String id, String name, String description, String icon, int pageCount, int draftCount) {
    }
}
