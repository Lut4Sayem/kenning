package com.knowledgeforge.knowledgeforge.node;

/** parentId null = top level; afterId null = at the end of the siblings; type null = PAGE. */
public record CreateNodeRequest(String parentId, String title, String afterId, NodeType type) {
    public CreateNodeRequest(String parentId, String title, String afterId) {
        this(parentId, title, afterId, null);
    }
}
