package com.knowledgeforge.knowledgeforge.node;

import java.util.List;

/** Null field = unchanged. An empty icon clears it; color "gray" (the default) clears it too. */
public record UpdateNodeRequest(String title, String icon, List<String> tags, String color) {
    public UpdateNodeRequest(String title, String icon, List<String> tags) {
        this(title, icon, tags, null);
    }
}
