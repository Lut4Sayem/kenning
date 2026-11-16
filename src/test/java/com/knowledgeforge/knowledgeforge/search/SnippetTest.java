package com.knowledgeforge.knowledgeforge.search;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.bson.Document;
import org.junit.jupiter.api.Test;

// QA-31: a long page gave its whole text as the snippet, so the one-line palette row cut the match off.
class SnippetTest {

    private static Document text(String type, String value) {
        return new Document("type", type).append("value", value);
    }

    private static List<Document> highlight(Document... texts) {
        return List.of(new Document("path", "text").append("texts", List.of(texts)));
    }

    @Test
    void startsShortlyBeforeTheFirstHitAndStopsAfterAFewWords() {
        String before = "Key ideas Self-attention replaces recurrence entirely and the model reaches state of the art scores on the ";
        String after = " benchmark for English to German translation, with a much shorter training time than earlier models "
                + "and a lot more text that nobody needs to read in a search result https://arxiv.org/abs/1706.03762";
        String s = SearchService.snippet(highlight(text("text", before), text("hit", "BLEU"), text("text", after)), null);

        assertTrue(s.startsWith("…"), s);
        int mark = s.indexOf("<mark>BLEU</mark>");
        assertTrue(mark > 0 && mark <= 70, s);
        assertTrue(s.endsWith("…"), s);
        assertTrue(s.length() <= 220, s);
        assertTrue(!s.contains("arxiv"), s);
    }

    @Test
    void aShortPassageIsKeptWhole() {
        assertEquals("a <mark>runbook</mark> for deploys",
                SearchService.snippet(highlight(text("text", "a "), text("hit", "runbook"), text("text", " for deploys")), null));
    }

    @Test
    void stillEscapes() {
        assertEquals("&lt;b&gt; <mark>x&amp;y</mark>",
                SearchService.snippet(highlight(text("text", "<b> "), text("hit", "x&y")), null));
    }
}
