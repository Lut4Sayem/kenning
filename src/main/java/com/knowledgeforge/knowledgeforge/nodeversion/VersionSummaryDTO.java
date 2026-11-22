package com.knowledgeforge.knowledgeforge.nodeversion;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.knowledgeforge.knowledgeforge.common.UserRef;

import java.util.Date;
import java.util.List;

public record VersionSummaryDTO(String id, VersionKind kind, String name, List<UserRef> authors,
                                Date createdAt, Date updatedAt, @JsonProperty("private") boolean isPrivate,
                                /** The live session could not be flushed first: the newest edits may be missing. */
                                boolean liveEditsMissing) {
}
