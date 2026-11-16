package com.knowledgeforge.knowledgeforge.node;

import com.knowledgeforge.knowledgeforge.common.UserRef;

import java.util.Date;

/**
 * Where a trashed page went (QA-33): the branch root to restore, who trashed it and when.
 * {@code canRestore}: edit rights on the branch root.
 */
public record TrashedDTO(String rootId, String rootTitle, String spaceId, UserRef by, Date at, boolean canRestore) {
}
