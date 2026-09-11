package auth

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/deepfurry/gopher-atlas/internal/audit"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/markdown"
	"github.com/deepfurry/gopher-atlas/internal/policy"
)

func (s *Service) ListUsers(ctx context.Context, p Principal, after int64) ([]dbsqlc.User, error) {
	if !policy.For(p.User.Role, p.User.Status).ManageUsers {
		return nil, fault.Permission
	}
	if after < 0 {
		return nil, fault.Validation
	}
	users, err := s.queries.ListUsers(ctx, dbsqlc.ListUsersParams{AfterID: after, PageSize: 100})
	return users, dbError(err)
}

func (s *Service) GetUser(ctx context.Context, p Principal, id int64) (dbsqlc.User, error) {
	if !policy.For(p.User.Role, p.User.Status).ManageUsers {
		return dbsqlc.User{}, fault.Permission
	}
	user, err := s.queries.GetUser(ctx, id)
	return user, dbError(err)
}

func (s *Service) ChangeUser(ctx context.Context, actor Principal, id int64, action, role string) (dbsqlc.User, error) {
	var result dbsqlc.User
	err := s.withActor(ctx, actor, func(q *dbsqlc.Queries, current Principal) error {
		if !policy.For(current.User.Role, current.User.Status).ManageUsers {
			return fault.Permission
		}
		target, err := q.GetUser(ctx, id)
		if err != nil {
			return dbError(err)
		}
		nextRole, nextStatus := target.Role, target.Status
		switch action {
		case "approve":
			if target.Status != "pending" || (role != "editor" && role != "reviewer") {
				return fault.Validation
			}
			nextRole, nextStatus = role, "active"
		case "disable":
			nextStatus = "disabled"
		case "enable":
			if target.Status != "disabled" {
				return fault.Validation
			}
			nextStatus = "active"
		case "role":
			if !policy.ValidRole(role) {
				return fault.Validation
			}
			nextRole = role
		default:
			return fault.Validation
		}
		if target.Role == "admin" && target.Status == "active" && (nextRole != "admin" || nextStatus != "active") {
			count, err := q.CountActiveAdmins(ctx)
			if err != nil {
				return fault.Unavailable
			}
			if count <= 1 {
				return fault.LastAdmin
			}
		}
		result, err = q.SetUserAccess(ctx, dbsqlc.SetUserAccessParams{ID: id, Role: nextRole, Status: nextStatus, UpdatedAt: s.now().UnixMilli()})
		if err != nil {
			return fault.Unavailable
		}
		if nextStatus == "disabled" {
			if err := q.RevokeUserSessions(ctx, dbsqlc.RevokeUserSessionsParams{UserID: id, RevokedAt: stamp(s.now().UnixMilli())}); err != nil {
				return fault.Unavailable
			}
		}
		actions := map[string]string{"approve": "user.approved", "disable": "user.disabled", "enable": "user.enabled", "role": "user.role_changed"}
		return audit.Append(ctx, q, audit.Event{ActorID: current.User.ID, Action: actions[action], EntityType: "user", EntityID: id, Metadata: audit.Metadata{Role: nextRole, Status: nextStatus}}, s.now().UnixMilli())
	})
	return result, err
}

func (s *Service) Profile(ctx context.Context, p Principal) (dbsqlc.AuthorProfile, error) {
	profile, err := s.queries.GetProfile(ctx, p.User.ID)
	return profile, dbError(err)
}

type ProfileInput struct {
	DisplayName string `json:"displayName"`
	BioMarkdown string `json:"bioMarkdown"`
	WebsiteURL  string `json:"websiteUrl"`
}

func (s *Service) UpdateProfile(ctx context.Context, actor Principal, input ProfileInput) (dbsqlc.AuthorProfile, error) {
	return s.UpdateAuthorProfile(ctx, actor, actor.User.ID, input)
}

// UpdateAuthorProfile reuses the same validation and audit path for explicit Admin edits.
func (s *Service) UpdateAuthorProfile(ctx context.Context, actor Principal, id int64, input ProfileInput) (dbsqlc.AuthorProfile, error) {
	var result dbsqlc.AuthorProfile
	input.DisplayName = strings.TrimSpace(input.DisplayName)
	if input.DisplayName == "" || !utf8.ValidString(input.DisplayName) || utf8.RuneCountInString(input.DisplayName) > 100 || len(input.BioMarkdown) > 10000 || !utf8.ValidString(input.BioMarkdown) || !markdown.Valid(input.BioMarkdown) || (input.WebsiteURL != "" && !safeWebURL(input.WebsiteURL, false)) {
		return result, fault.Validation
	}
	err := s.withActor(ctx, actor, func(q *dbsqlc.Queries, current Principal) error {
		if !policy.For(current.User.Role, current.User.Status).EditOwnProfile || (id != current.User.ID && !policy.For(current.User.Role, current.User.Status).ManageAuthorProfiles) {
			return fault.Permission
		}
		var err error
		result, err = q.UpdateProfile(ctx, dbsqlc.UpdateProfileParams{UserID: id, DisplayName: input.DisplayName, BioMarkdown: input.BioMarkdown, WebsiteUrl: input.WebsiteURL, UpdatedAt: s.now().UnixMilli()})
		if err != nil {
			return dbError(err)
		}
		return audit.Append(ctx, q, audit.Event{ActorID: current.User.ID, Action: "author.profile_updated", EntityType: "author", EntityID: id}, s.now().UnixMilli())
	})
	return result, err
}

func safeWebURL(value string, httpsOnly bool) bool {
	return len(value) <= 2048 && markdown.WebURL(value, httpsOnly)
}
