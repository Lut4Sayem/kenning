package com.knowledgeforge.knowledgeforge.team;

/** PATCH /api/teams/{id} (QA-63). A null field is left as it is. */
public record UpdateTeamRequest(String teamName, String teamDescription) {
}
