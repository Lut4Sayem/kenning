package com.knowledgeforge.knowledgeforge.team;

/** What someone who holds an invite link may see: no ids, no emails, no member list. */
public record InvitePreviewDTO(String teamName, long memberCount, String invitedByName) {}
