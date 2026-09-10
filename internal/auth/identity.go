package auth

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"

	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/oauth"
)

func (s *Service) login(ctx context.Context, identity oauth.Identity, oldSession string) (Credentials, error) {
	if identity.ID <= 0 || strings.TrimSpace(identity.Login) == "" || len(identity.Login) > 100 {
		return Credentials{}, fault.OAuth
	}
	sessionToken, err := s.token()
	if err != nil {
		return Credentials{}, fault.Unavailable
	}
	csrfToken, err := s.token()
	if err != nil {
		return Credentials{}, fault.Unavailable
	}
	now := s.now()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Credentials{}, fault.Unavailable
	}
	defer tx.Rollback()
	q := s.queries.WithTx(tx)
	user, err := q.GetUserByGitHubID(ctx, identity.ID)
	isNew := errors.Is(err, sql.ErrNoRows)
	if err != nil && !isNew {
		return Credentials{}, fault.Unavailable
	}
	if !isNew && user.Status == "disabled" {
		return Credentials{}, fault.Disabled
	}
	count, err := q.CountActiveAdmins(ctx)
	if err != nil {
		return Credentials{}, fault.Unavailable
	}
	bootstrap := count == 0 && identity.ID == s.cfg.BootstrapAdminID
	if isNew {
		role, status := "editor", "pending"
		if bootstrap {
			role, status = "admin", "active"
		}
		user, err = q.CreateUser(ctx, dbsqlc.CreateUserParams{GithubUserID: identity.ID, GithubLogin: identity.Login, Role: role, Status: status, CreatedAt: now.UnixMilli(), UpdatedAt: now.UnixMilli(), LastLoginAt: stamp(now.UnixMilli())})
		if err != nil {
			return Credentials{}, fault.Unavailable
		}
		name := strings.TrimSpace(identity.Name)
		if name == "" || len([]rune(name)) > 100 {
			name = identity.Login
		}
		avatar := identity.AvatarURL
		if !safeWebURL(avatar, true) {
			avatar = ""
		}
		// Numeric identity makes the slug deterministic, unique and stable across renames.
		err = q.CreateProfile(ctx, dbsqlc.CreateProfileParams{UserID: user.ID, Slug: "github-" + strconv.FormatInt(identity.ID, 10), DisplayName: name, AvatarUrl: avatar, CreatedAt: now.UnixMilli(), UpdatedAt: now.UnixMilli()})
		if err != nil {
			return Credentials{}, fault.Unavailable
		}
	} else {
		if bootstrap {
			user, err = q.SetUserAccess(ctx, dbsqlc.SetUserAccessParams{ID: user.ID, Role: "admin", Status: "active", UpdatedAt: now.UnixMilli()})
			if err != nil {
				return Credentials{}, fault.Unavailable
			}
		}
		user, err = q.RefreshLogin(ctx, dbsqlc.RefreshLoginParams{ID: user.ID, GithubLogin: identity.Login, LastLoginAt: stamp(now.UnixMilli()), UpdatedAt: now.UnixMilli()})
		if err != nil {
			return Credentials{}, fault.Unavailable
		}
	}
	if validToken(oldSession) {
		if err := q.RevokeSession(ctx, dbsqlc.RevokeSessionParams{TokenHash: Hash(oldSession), RevokedAt: stamp(now.UnixMilli())}); err != nil {
			return Credentials{}, fault.Unavailable
		}
	}
	if err := q.CleanupSessions(ctx, now.UnixMilli()); err != nil {
		return Credentials{}, fault.Unavailable
	}
	expires := now.Add(s.cfg.SessionTTL)
	_, err = q.CreateSession(ctx, dbsqlc.CreateSessionParams{UserID: user.ID, TokenHash: Hash(sessionToken), CsrfTokenHash: Hash(csrfToken), CreatedAt: now.UnixMilli(), ExpiresAt: expires.UnixMilli(), LastSeenAt: now.UnixMilli()})
	if err != nil {
		return Credentials{}, fault.Unavailable
	}
	if err := tx.Commit(); err != nil {
		return Credentials{}, fault.Unavailable
	}
	return Credentials{Session: sessionToken, CSRF: csrfToken, Expires: expires}, nil
}
