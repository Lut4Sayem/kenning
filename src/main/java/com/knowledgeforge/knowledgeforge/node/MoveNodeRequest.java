package com.knowledgeforge.knowledgeforge.node;

/**
 * parentId null = top level. With neither beforeId nor afterId the node goes to the end.
 * spaceId null = stay in the page's space; another space of the same team moves the branch there (QA-12).
 */
public record MoveNodeRequest(String parentId, String beforeId, String afterId, String spaceId) {
    public MoveNodeRequest(String parentId, String beforeId, String afterId) {
        this(parentId, beforeId, afterId, null);
    }
}
