package com.knowledgeforge.knowledgeforge.collab;

import com.knowledgeforge.knowledgeforge.nodecontent.ContentDTO;
import com.knowledgeforge.knowledgeforge.nodecontent.NodeContentService;
import com.knowledgeforge.knowledgeforge.nodecontent.SavedDTO;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * The ticket a browser needs to join a page's live session, and the internal API the collaboration service
 * loads and stores pages through. /internal is reached only on the Docker network (Caddy never routes it) and
 * every call must carry X-Collab-Secret.
 */
@RestController
public class CollabController {
    private final CollabTicketService tickets;
    private final NodeContentService contents;

    public CollabController(CollabTicketService tickets, NodeContentService contents) {
        this.tickets = tickets;
        this.contents = contents;
    }

    @PostMapping("/api/nodes/{id}/collab-ticket")
    public TicketDTO ticket(@PathVariable String id) {
        return tickets.ticket(id);
    }

    @GetMapping("/internal/collab/nodes/{id}/content")
    public ContentDTO content(@RequestHeader(value = "X-Collab-Secret", required = false) String secret, @PathVariable String id) {
        requireSecret(secret);
        return contents.contentFor(id);
    }

    @PutMapping("/internal/collab/nodes/{id}/content")
    public SavedDTO store(@RequestHeader(value = "X-Collab-Secret", required = false) String secret, @PathVariable String id,
                          @RequestBody StoreRequest request) {
        requireSecret(secret);
        return contents.storeFromCollab(id, request);
    }

    private void requireSecret(String header) {
        if (!tickets.secretMatches(header)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden");
    }
}
