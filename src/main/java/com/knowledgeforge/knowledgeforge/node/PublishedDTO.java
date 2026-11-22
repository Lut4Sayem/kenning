package com.knowledgeforge.knowledgeforge.node;

import com.fasterxml.jackson.annotation.JsonUnwrapped;

/** A published node; {@code liveEditsMissing}: the live session could not be stored first, so the newest edits may be missing. */
public record PublishedDTO(@JsonUnwrapped NodeDTO node, boolean liveEditsMissing) {}
