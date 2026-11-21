package com.knowledgeforge.knowledgeforge.nodecontent;

import org.springframework.web.bind.annotation.*;

@RestController
/** Reading only: page content is written by the collaboration service (CollabController's internal API). */
public class NodeContentController {
    private final NodeContentService service;

    public NodeContentController(NodeContentService service) {
        this.service = service;
    }

    @GetMapping("/api/nodes/{id}/content")
    public ContentDTO get(@PathVariable String id) {
        return service.get(id);
    }
}
