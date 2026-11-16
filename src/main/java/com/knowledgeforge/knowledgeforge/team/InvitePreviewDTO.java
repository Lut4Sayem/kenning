package com.knowledgeforge.knowledgeforge.team;

/**
 * What someone who holds an invite link may see: no ids, no emails, no member list.
 * hasPendingRequest: the caller already asked to join and is waiting (QA-05).
 * isMember: the caller is in the team already (QA-41); only then teamId is filled, so the page can open the team.
 */
public record InvitePreviewDTO(String teamName, long memberCount, String invitedByName, boolean hasPendingRequest,
                               boolean isMember, String teamId) {}
