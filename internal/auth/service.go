// Package auth owns identity/session transactions and calls sqlc directly.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"errors"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/config"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/oauth"
	"github.com/deepfurry/gopher-atlas/internal/outbox"
)

type Service struct {
	fence    *outbox.Fence
	db       *sql.DB
	queries  *dbsqlc.Queries
	cfg      config.Config
	provider oauth.Provider
	now      func() time.Time
	token    func() (string, error)
}

func New(db *sql.DB, cfg config.Config, provider oauth.Provider) *Service {
	return &Service{fence: &outbox.Fence{}, db: db, queries: dbsqlc.New(db), cfg: cfg, provider: provider, now: time.Now, token: RandomToken}
}

func (s *Service) PublicationFence() *outbox.Fence { return s.fence }

// RandomToken carries 256 bits of entropy. Raw values are only returned to the browser.
func RandomToken() (string, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", fault.Unavailable
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func Hash(value string) []byte { sum := sha256.Sum256([]byte(value)); return sum[:] }
func validToken(value string) bool {
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	return len(value) == 43 && err == nil && len(decoded) == 32
}
func stamp(now int64) sql.NullInt64 { return sql.NullInt64{Int64: now, Valid: true} }
func dbError(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return fault.NotFound
	}
	if err != nil {
		return fault.Unavailable
	}
	return nil
}

type Principal struct {
	User    dbsqlc.User
	Session dbsqlc.Session
}
type Credentials struct {
	Session, CSRF string
	Expires       time.Time
}

func (s *Service) Start(ctx context.Context) (string, string, error) {
	if s.provider == nil {
		return "", "", fault.Unavailable
	}
	state, err := s.token()
	if err != nil {
		return "", "", fault.Unavailable
	}
	now := s.now()
	if err := s.queries.CleanupStates(ctx, now.UnixMilli()); err != nil {
		return "", "", fault.Unavailable
	}
	if err := s.queries.CreateState(ctx, dbsqlc.CreateStateParams{StateHash: Hash(state), CreatedAt: now.UnixMilli(), ExpiresAt: now.Add(s.cfg.StateTTL).UnixMilli()}); err != nil {
		return "", "", fault.Unavailable
	}
	return state, s.provider.AuthorizationURL(state), nil
}

func (s *Service) Callback(ctx context.Context, state, browserState, code, oldSession string) (Credentials, error) {
	if !validToken(state) || !validToken(browserState) || subtle.ConstantTimeCompare([]byte(state), []byte(browserState)) != 1 {
		return Credentials{}, fault.State
	}
	affected, err := s.queries.ConsumeState(ctx, dbsqlc.ConsumeStateParams{Now: stamp(s.now().UnixMilli()), StateHash: Hash(state)})
	if err != nil {
		return Credentials{}, fault.Unavailable
	}
	if affected != 1 {
		return Credentials{}, fault.State
	}
	if s.provider == nil || code == "" || len(code) > 1024 {
		return Credentials{}, fault.OAuth
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	identity, err := s.provider.Identity(ctx, code)
	if err != nil {
		return Credentials{}, fault.OAuth
	}
	return s.login(ctx, identity, oldSession)
}

func (s *Service) Resolve(ctx context.Context, token string) (Principal, error) {
	if !validToken(token) {
		return Principal{}, fault.Authentication
	}
	p, err := resolve(ctx, s.queries, Hash(token), s.now().UnixMilli())
	if err != nil {
		return Principal{}, err
	}
	if p.Session.LastSeenAt < s.now().Add(-5*time.Minute).UnixMilli() {
		if err := s.queries.TouchSession(ctx, dbsqlc.TouchSessionParams{ID: p.Session.ID, LastSeenAt: s.now().UnixMilli(), LastSeenAt_2: s.now().Add(-5 * time.Minute).UnixMilli()}); err != nil {
			return Principal{}, fault.Unavailable
		}
	}
	return p, nil
}

func resolve(ctx context.Context, q *dbsqlc.Queries, hash []byte, now int64) (Principal, error) {
	session, err := q.GetSession(ctx, dbsqlc.GetSessionParams{TokenHash: hash, ExpiresAt: now})
	if errors.Is(err, sql.ErrNoRows) {
		return Principal{}, fault.Authentication
	}
	if err != nil {
		return Principal{}, fault.Unavailable
	}
	user, err := q.GetUser(ctx, session.UserID)
	if err != nil {
		return Principal{}, fault.Unavailable
	}
	if user.Status == "disabled" {
		return Principal{}, fault.Disabled
	}
	return Principal{User: user, Session: session}, nil
}

func (s *Service) CheckCSRF(p Principal, origin, header, cookie string) error {
	if origin != s.cfg.BaseURL || !validToken(header) || !validToken(cookie) || subtle.ConstantTimeCompare([]byte(header), []byte(cookie)) != 1 || subtle.ConstantTimeCompare(Hash(header), p.Session.CsrfTokenHash) != 1 {
		return fault.CSRF
	}
	return nil
}

func (s *Service) Logout(ctx context.Context, p Principal) error {
	return dbError(s.queries.RevokeSession(ctx, dbsqlc.RevokeSessionParams{TokenHash: p.Session.TokenHash, RevokedAt: stamp(s.now().UnixMilli())}))
}

// withActor obtains SQLite's immediate write lock then rechecks authorization.
// A concurrently disabled/demoted actor cannot commit using stale middleware data.
func (s *Service) withActor(ctx context.Context, actor Principal, fn func(*dbsqlc.Queries, Principal) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fault.Unavailable
	}
	defer tx.Rollback()
	q := s.queries.WithTx(tx)
	current, err := Reauthorize(ctx, q, actor, s.now().UnixMilli())
	if err != nil {
		return err
	}
	if err := fn(q, current); err != nil {
		return err
	}
	return dbError(tx.Commit())
}

// Reauthorize resolves a session within a service-owned immediate transaction.
// Editorial services must never authorize a write from cached middleware roles.
func Reauthorize(ctx context.Context, q *dbsqlc.Queries, actor Principal, now int64) (Principal, error) {
	current, err := resolve(ctx, q, actor.Session.TokenHash, now)
	if err != nil {
		return Principal{}, err
	}
	if current.User.Status != "active" {
		return Principal{}, fault.Pending
	}
	return current, nil
}
