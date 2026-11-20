package com.knowledgeforge.knowledgeforge.space;

import com.knowledgeforge.knowledgeforge.team.TeamMemberRepository;
import com.knowledgeforge.knowledgeforge.team.TeamRepository;
import com.knowledgeforge.knowledgeforge.user.User;
import com.knowledgeforge.knowledgeforge.user.UserRepository;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;


@Service
public class SpaceService {
    final TeamMemberRepository teamMemberRepository;
    final UserRepository userRepository;
    final SpaceRepository spaceRepository;
    final TeamRepository teamRepository;
    public SpaceService(TeamMemberRepository teamMemberRepository, SpaceRepository spaceRepository, UserRepository userRepository, TeamRepository teamRepository) {
        this.teamRepository = teamRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.userRepository = userRepository;
        this.spaceRepository = spaceRepository;
    }

    public Space createSpace(String teamId, CreateSpaceRequest createSpaceRequest) {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        Optional<User> userEmail= userRepository.findByEmail(email);
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        String userId = user.getId();
        boolean exists = teamMemberRepository.existsByTeamIdAndUserId(teamId, userId);

        if(!exists){
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User or Team Not Found");
        }
        if (!teamMemberRepository.canEdit(teamId, userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only an ADMIN or EDITOR can create spaces");
        }

        Space space = new Space();
        space.setName(createSpaceRequest.getName());
        space.setDescription(createSpaceRequest.getDescription());
        space.setTeamId(teamId);
        space.setOwnerType(Space.OwnerType.TEAM);
        space.setCreatedAt(new Date());
        space.setCreatedBy(userId);
        space.setUpdatedAt(new Date());
        return spaceRepository.save(space);

    }

    public List<Space> getSpace(String teamId) {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        Optional<User> userEmail= userRepository.findByEmail(email);
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        String userId = user.getId();
        boolean exists = teamMemberRepository.existsByTeamIdAndUserId(teamId, userId);
        if(!exists){
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You are not a part of the team");
        }
        return spaceRepository.findByTeamId(teamId);
    }

    /** Idempotent: the unique partial index on ownerUserId guarantees one personal space per user. */
    public Space createPersonalSpace(String userId) {
        return spaceRepository.findByOwnerUserId(userId).orElseGet(() -> {
            Space space = new Space();
            space.setName("Private");
            space.setOwnerType(Space.OwnerType.USER);
            space.setOwnerUserId(userId);
            space.setCreatedBy(userId);
            space.setCreatedAt(new Date());
            space.setUpdatedAt(new Date());
            try {
                return spaceRepository.save(space);
            } catch (DuplicateKeyException e) {
                return spaceRepository.findByOwnerUserId(userId).orElseThrow(() -> e);
            }
        });
    }

    /** Team spaces where I am a member, then my personal space. */
    public List<MySpaceDTO> getMySpaces() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));

        Map<String, String> roleByTeam = new HashMap<>();
        teamMemberRepository.findByUserId(user.getId()).forEach(m -> roleByTeam.put(m.getTeamId(), m.getRole()));
        Map<String, String> nameByTeam = new HashMap<>();
        if (!roleByTeam.isEmpty()) {
            teamRepository.findByIdIn(new ArrayList<>(roleByTeam.keySet()))
                    .forEach(t -> nameByTeam.put(t.getId(), t.getName()));
        }

        List<MySpaceDTO> out = new ArrayList<>();
        if (!roleByTeam.isEmpty()) {
            for (Space s : spaceRepository.findByTeamIdIn(new ArrayList<>(roleByTeam.keySet()))) {
                out.add(new MySpaceDTO(s.getId(), s.getName(), s.getIcon(), Space.OwnerType.TEAM, s.getTeamId(),
                        nameByTeam.get(s.getTeamId()), roleByTeam.get(s.getTeamId())));
            }
        }
        spaceRepository.findByOwnerUserId(user.getId()).ifPresent(s ->
                out.add(new MySpaceDTO(s.getId(), s.getName(), s.getIcon(), Space.OwnerType.USER, null, null, null)));
        return out;
    }

    static final int MAX_NAME = 200; // the page title limit

    /** Team ADMINs and EDITORs; same rules as a page title (trimmed, at most 200), but a space needs a name. */
    public Space renameSpace(String spaceId, RenameSpaceRequest req) {
        Space space = teamSpaceFor(spaceId, "renamed");
        if (!teamMemberRepository.canEdit(space.getTeamId(), currentUserId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only a team admin or editor can rename a space");
        }
        String name = req == null || req.name() == null ? "" : req.name().trim();
        if (name.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A space needs a name");
        if (name.codePointCount(0, name.length()) > MAX_NAME) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A space name can be at most " + MAX_NAME + " characters");
        }
        space.setName(name);
        space.setUpdatedAt(new Date());
        return spaceRepository.save(space);
    }

    /** A team space the current user is a member of (else 404). The personal space is the owner's only: 400 for them, 404 for others. */
    private Space teamSpaceFor(String spaceId, String verb) {
        String userId = currentUserId();
        Space space = spaceRepository.findById(spaceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Space not found"));
        if (space.getOwnerType() == Space.OwnerType.USER) {
            if (!userId.equals(space.getOwnerUserId())) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Space not found");
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Your Private space can’t be " + verb);
        }
        if (!teamMemberRepository.existsByTeamIdAndUserId(space.getTeamId(), userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Space not found");
        }
        return space;
    }

    private String currentUserId() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found")).getId();
    }
}
