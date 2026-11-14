package com.knowledgeforge.knowledgeforge.auth;

import com.knowledgeforge.knowledgeforge.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Over HTTP routing: only failed logins count, per IP and email. */
@AutoConfigureMockMvc
class LoginRateLimitIT extends IntegrationTest {

    @Autowired MockMvc mvc;

    private static RequestPostProcessor from(String ip) {
        return r -> { r.setRemoteAddr(ip); return r; };
    }

    private int login(String ip, String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf()).with(from(ip)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}")).andReturn().getResponse().getStatus();
    }

    private String register(String ip) throws Exception {
        String email = UUID.randomUUID() + "@example.test";
        mvc.perform(post("/api/auth/register").with(csrf()).with(from(ip)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Mate\",\"email\":\"" + email + "\",\"password\":\"password123\"}")).andExpect(status().isOk());
        return email;
    }

    @Test
    void classmatesOnOneIpCanAllLogIn() throws Exception {
        String ip = "10.9.0.1";
        for (int i = 0; i < 4; i++) {
            String email = register("10.9.1." + i); // register is per IP, so spread it
            for (int k = 0; k < 6; k++) org.junit.jupiter.api.Assertions.assertEquals(200, login(ip, email, "password123"), "login " + i + "/" + k);
        }
    }

    @Test
    void tenFailuresBlockThatEmailOnThatIpOnly() throws Exception {
        String email = register("10.9.2.1");
        String other = register("10.9.2.2");
        for (int i = 0; i < 10; i++) org.junit.jupiter.api.Assertions.assertEquals(401, login("10.9.2.9", email, "wrong"), "fail " + i);
        org.junit.jupiter.api.Assertions.assertEquals(429, login("10.9.2.9", email, "wrong"));
        org.junit.jupiter.api.Assertions.assertEquals(429, login("10.9.2.9", email.toUpperCase(), "password123"), "same email, any case, even with the right password");
        org.junit.jupiter.api.Assertions.assertEquals(200, login("10.9.2.9", other, "password123"), "another account on that IP");
        org.junit.jupiter.api.Assertions.assertEquals(200, login("10.9.2.8", email, "password123"), "same account from another IP");
    }

    @Test
    void successfulLoginsDoNotCountTowardsFailures() throws Exception {
        String email = register("10.9.3.1");
        for (int i = 0; i < 9; i++) login("10.9.3.9", email, "wrong");
        for (int i = 0; i < 20; i++) org.junit.jupiter.api.Assertions.assertEquals(200, login("10.9.3.9", email, "password123"));
    }
}
