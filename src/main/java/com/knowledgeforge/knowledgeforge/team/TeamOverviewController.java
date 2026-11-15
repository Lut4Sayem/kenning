package com.knowledgeforge.knowledgeforge.team;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/teams/{teamId}")
public class TeamOverviewController {

    private final TeamOverviewService service;

    public TeamOverviewController(TeamOverviewService service) {
        this.service = service;
    }

    @GetMapping("/summary")
    public TeamOverviewDTO.Summary summary(@PathVariable String teamId) {
        return service.summary(teamId);
    }

    @GetMapping("/pages")
    public TeamOverviewDTO.Pages pages(@PathVariable String teamId,
                                       @RequestParam(required = false) String status,
                                       @RequestParam(required = false) String spaceId,
                                       @RequestParam(required = false) String editedBy,
                                       @RequestParam(required = false) String sort,
                                       @RequestParam(required = false) Integer page,
                                       @RequestParam(required = false) Integer size) {
        return service.pages(teamId, status, spaceId, editedBy, sort, page, size);
    }

    @GetMapping("/activity")
    public List<TeamOverviewDTO.ActivityItem> activity(@PathVariable String teamId, @RequestParam(required = false) Integer limit) {
        return service.activity(teamId, limit);
    }
}
