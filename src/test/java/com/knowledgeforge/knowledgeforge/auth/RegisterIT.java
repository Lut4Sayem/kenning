package com.knowledgeforge.knowledgeforge.auth;

import com.knowledgeforge.knowledgeforge.support.IntegrationTest;
import com.knowledgeforge.knowledgeforge.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** POST /api/auth/register. */
@AutoConfigureMockMvc
class RegisterIT extends IntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;

    private ResultActions register(String ip, String body) throws Exception {
        return mvc.perform(post("/api/auth/register").with(csrf()).with(r -> { r.setRemoteAddr(ip); return r; })
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /** QA-50: an account without a name breaks every screen that greets or lists people. */
    @Test
    void fullNameIsRequired() throws Exception {
        String email = UUID.randomUUID() + "@example.test";
        register("10.7.0.1", "{\"email\":\"" + email + "\",\"password\":\"password123\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Enter your full name"));
        register("10.7.0.2", "{\"fullName\":\"   \",\"email\":\"" + email + "\",\"password\":\"password123\"}")
                .andExpect(status().isBadRequest());
        assertTrue(users.findByEmail(email).isEmpty());
    }

    /** QA-01: a new account is signed in straight away, so the app can go on to Home or the invite. */
    @Test
    void registerSignsYouIn() throws Exception {
        String email = UUID.randomUUID() + "@example.test";
        MockHttpSession session = (MockHttpSession) register("10.7.0.3",
                "{\"fullName\":\"Tanvir Ahmed\",\"email\":\"" + email + "\",\"password\":\"password123\"}")
                .andExpect(status().isOk()).andReturn().getRequest().getSession(false);
        assertNotNull(session);
        mvc.perform(get("/api/me").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email));
    }
}
