package com.knowledgeforge.knowledgeforge.collab;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CollabTicketServiceTest {
    // Same vector as collab/test/ticket.test.ts: both sides must produce and accept exactly this token.
    static final String VECTOR = "eyJub2RlSWQiOiJuMSIsInVzZXJJZCI6InUxIiwibmFtZSI6IkFubiIsImFjY2VzcyI6IkVESVQiLCJlcG9jaCI6MCwiZXhwIjo0MTAyNDQ0ODAwMDAwfQ.H6_6A7cmoKmEboIf9zCwPQcmSvkMF1kA0xzbWx2Qpqw";

    @Test
    void signMatchesVector() {
        CollabTicketService s = new CollabTicketService("test-secret", null, null, null);
        assertEquals(VECTOR, s.sign("{\"nodeId\":\"n1\",\"userId\":\"u1\",\"name\":\"Ann\",\"access\":\"EDIT\",\"epoch\":0,\"exp\":4102444800000}"));
    }

    @Test
    void secretCheck() {
        assertTrue(new CollabTicketService("s3cret", null, null, null).secretMatches("s3cret"));
        assertFalse(new CollabTicketService("s3cret", null, null, null).secretMatches("s3cre"));
        assertFalse(new CollabTicketService("s3cret", null, null, null).secretMatches(null));
        assertFalse(new CollabTicketService("", null, null, null).secretMatches(""));
    }
}
