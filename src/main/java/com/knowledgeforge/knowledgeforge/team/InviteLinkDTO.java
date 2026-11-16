package com.knowledgeforge.knowledgeforge.team;

import java.util.Date;

/** The team's one invite link, as admins see it on the Members tab. createdByName is null when that user is gone. */
public record InviteLinkDTO(String inviteCode, Date createdAt, String createdByName) {}
