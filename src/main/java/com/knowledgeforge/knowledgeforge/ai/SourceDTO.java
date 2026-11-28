package com.knowledgeforge.knowledgeforge.ai;

import com.knowledgeforge.knowledgeforge.node.NodeType;

// n = the [n] number used in the answer text
public record SourceDTO(int n, String id, String title, NodeType type) {}
