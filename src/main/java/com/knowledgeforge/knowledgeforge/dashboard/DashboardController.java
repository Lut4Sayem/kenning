package com.knowledgeforge.knowledgeforge.dashboard;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class DashboardController {

    private final DashboardService dashboardService;
    private final DraftsService draftsService;

    public DashboardController(DashboardService dashboardService, DraftsService draftsService) {
        this.dashboardService = dashboardService;
        this.draftsService = draftsService;
    }

    @GetMapping("/me/drafts")
    public DraftsDTO drafts(@RequestParam(name = "limit", required = false) Integer limit) {
        return draftsService.drafts(limit);
    }

    @GetMapping("/dashboard")
    public ResponseEntity<DashboardResponseDTO> getDashboard() {
        return ResponseEntity.ok(dashboardService.getDashboard());
    }
}