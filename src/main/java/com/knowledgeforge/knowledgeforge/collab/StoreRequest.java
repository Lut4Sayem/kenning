package com.knowledgeforge.knowledgeforge.collab;

import java.util.List;

/** A store from the collaboration service. authors = user ids that sent edits since its last store. */
public record StoreRequest(Long baseRevision, Integer baseEpoch, String state, String text, List<String> authors) {
}
