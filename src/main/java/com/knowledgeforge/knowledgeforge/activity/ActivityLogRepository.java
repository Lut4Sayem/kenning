package com.knowledgeforge.knowledgeforge.activity;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface ActivityLogRepository extends MongoRepository<ActivityLog, String> {
    void deleteByTeamId(String teamId);

    List<ActivityLog> findTop20ByTeamIdInOrderByCreatedAtDesc(List<String> teamIds);

    /** Uses index teamId_createdAt. */
    List<ActivityLog> findByTeamIdOrderByCreatedAtDesc(String teamId, org.springframework.data.domain.Pageable page);
}