package com.knowledgeforge.knowledgeforge.team;

/**
 * What someone who holds an invite link may see: no ids, no emails, no member list.
 * hasPendingRequest: the caller already asked to join and is waiting (QA-05).
 */
public record InvitePreviewDTO(String teamName, long memberCount, String invitedByName, boolean hasPendingRequest) {}
