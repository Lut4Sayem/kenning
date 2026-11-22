package com.knowledgeforge.knowledgeforge.collab;

/** access is EDIT or VIEW; epoch is the content epoch the page is at now. */
public record TicketDTO(String ticket, String access, int epoch) {
}
