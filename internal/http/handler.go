package http

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/deepfurry/gopher-atlas/internal/auth"
	"github.com/deepfurry/gopher-atlas/internal/config"
	"github.com/deepfurry/gopher-atlas/internal/database"
	dbsqlc "github.com/deepfurry/gopher-atlas/internal/database/sqlc"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/deepfurry/gopher-atlas/internal/policy"
	"github.com/gofiber/fiber/v3"
)

type Handler struct {
	Auth   *auth.Service
	DB     *sql.DB
	Config config.Config
}
type principalKey struct{}

func (h *Handler) cookieName(kind string) string {
	if h.Config.SecureCookies() {
		return "__Host-gopheratlas_" + kind
	}
	return "gopheratlas_dev_" + kind
}
func (h *Handler) cookie(c fiber.Ctx, kind, value string, expires time.Time, maxAge int) {
	c.Cookie(&fiber.Cookie{Name: h.cookieName(kind), Value: value, Path: "/", Secure: h.Config.SecureCookies(), HTTPOnly: kind != "csrf", SameSite: "Lax", Expires: expires, MaxAge: maxAge})
}
func (h *Handler) expire(c fiber.Ctx, kind string) { h.cookie(c, kind, "", time.Unix(1, 0), -1) }
func principal(c fiber.Ctx) auth.Principal         { return c.Locals(principalKey{}).(auth.Principal) }

func (h *Handler) requireSession(c fiber.Ctx) error {
	p, err := h.Auth.Resolve(c.Context(), c.Cookies(h.cookieName("session")))
	if err != nil {
		return err
	}
	c.Locals(principalKey{}, p)
	return c.Next()
}
func (h *Handler) active(c fiber.Ctx) error {
	if principal(c).User.Status != "active" {
		return fault.Pending
	}
	return c.Next()
}
func (h *Handler) csrf(c fiber.Ctx) error {
	if c.Method() != "GET" && c.Method() != "HEAD" && c.Method() != "OPTIONS" {
		if err := h.Auth.CheckCSRF(principal(c), c.Get("Origin"), c.Get("X-CSRF-Token"), c.Cookies(h.cookieName("csrf"))); err != nil {
			return err
		}
	}
	return c.Next()
}

// MonitorGuard resolves the shared session before Monitor wraps ordinary auth.
func (h *Handler) MonitorGuard(c fiber.Ctx) error {
	if c.Path() != "/ops/monitor" {
		return c.Next()
	}
	p, err := h.Auth.Resolve(c.Context(), c.Cookies(h.cookieName("session")))
	if err != nil {
		return err
	}
	if !policy.For(p.User.Role, p.User.Status).ViewMonitor {
		return fault.Permission
	}
	return c.Next()
}
func (h *Handler) ready(c fiber.Ctx) error {
	if err := database.Ready(c.Context(), h.DB); err != nil {
		return fault.Unavailable
	}
	return c.JSON(fiber.Map{"status": "ok"})
}
func (h *Handler) start(c fiber.Ctx) error {
	state, location, err := h.Auth.Start(c.Context())
	if err != nil {
		return err
	}
	h.cookie(c, "oauth_state", state, time.Now().Add(h.Config.StateTTL), int(h.Config.StateTTL.Seconds()))
	return c.Redirect().Status(302).To(location)
}
func (h *Handler) callback(c fiber.Ctx) error {
	stateCookie := strings.Clone(c.Cookies(h.cookieName("oauth_state")))
	h.expire(c, "oauth_state")
	credentials, err := h.Auth.Callback(c.Context(), c.Query("state"), stateCookie, c.Query("code"), c.Cookies(h.cookieName("session")))
	if err != nil {
		return err
	}
	h.cookie(c, "session", credentials.Session, credentials.Expires, int(h.Config.SessionTTL.Seconds()))
	h.cookie(c, "csrf", credentials.CSRF, credentials.Expires, int(h.Config.SessionTTL.Seconds()))
	return c.Redirect().Status(303).To("/")
}
func (h *Handler) logout(c fiber.Ctx) error {
	if err := h.Auth.Logout(c.Context(), principal(c)); err != nil {
		return err
	}
	h.expire(c, "session")
	h.expire(c, "csrf")
	h.expire(c, "oauth_state")
	return c.SendStatus(204)
}

func userJSON(u dbsqlc.User) fiber.Map {
	var last any
	if u.LastLoginAt.Valid {
		last = u.LastLoginAt.Int64
	}
	return fiber.Map{"id": u.ID, "githubUserId": u.GithubUserID, "githubLogin": u.GithubLogin, "role": u.Role, "status": u.Status, "createdAt": u.CreatedAt, "updatedAt": u.UpdatedAt, "lastLoginAt": last}
}
func profileJSON(p dbsqlc.AuthorProfile) fiber.Map {
	return fiber.Map{"slug": p.Slug, "displayName": p.DisplayName, "bioMarkdown": p.BioMarkdown, "avatarUrl": p.AvatarUrl, "websiteUrl": p.WebsiteUrl}
}
func (h *Handler) me(c fiber.Ctx) error {
	p := principal(c)
	profile, err := h.Auth.Profile(c.Context(), p)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"user": userJSON(p.User), "profile": profileJSON(profile), "permissions": policy.For(p.User.Role, p.User.Status)})
}
func (h *Handler) listUsers(c fiber.Ctx) error {
	after, err := strconv.ParseInt(c.Query("after", "0"), 10, 64)
	if err != nil || after < 0 {
		return fault.Validation
	}
	users, err := h.Auth.ListUsers(c.Context(), principal(c), after)
	if err != nil {
		return err
	}
	items := make([]fiber.Map, 0, len(users))
	for _, u := range users {
		items = append(items, userJSON(u))
	}
	var next any
	if len(users) == 100 {
		next = users[len(users)-1].ID
	}
	return c.JSON(fiber.Map{"users": items, "nextCursor": next})
}
func userID(c fiber.Ctx) (int64, error) {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id <= 0 {
		return 0, fault.Validation
	}
	return id, nil
}
func (h *Handler) getUser(c fiber.Ctx) error {
	id, err := userID(c)
	if err != nil {
		return err
	}
	user, err := h.Auth.GetUser(c.Context(), principal(c), id)
	if err != nil {
		return err
	}
	return c.JSON(userJSON(user))
}
func (h *Handler) changeUser(c fiber.Ctx) error {
	id, err := userID(c)
	if err != nil {
		return err
	}
	action := c.Params("action")
	if c.Method() == "PUT" {
		action = "role"
	}
	if action != "approve" && action != "disable" && action != "enable" && action != "role" {
		return fault.NotFound
	}
	var input struct {
		Role string `json:"role"`
	}
	if action == "approve" || action == "role" {
		if err := decode(c, &input); err != nil {
			return err
		}
	}
	user, err := h.Auth.ChangeUser(c.Context(), principal(c), id, action, input.Role)
	if err != nil {
		return err
	}
	return c.JSON(userJSON(user))
}
func (h *Handler) profile(c fiber.Ctx) error {
	profile, err := h.Auth.Profile(c.Context(), principal(c))
	if err != nil {
		return err
	}
	return c.JSON(profileJSON(profile))
}
func (h *Handler) updateProfile(c fiber.Ctx) error {
	var input struct {
		DisplayName *string `json:"displayName"`
		BioMarkdown *string `json:"bioMarkdown"`
		WebsiteURL  *string `json:"websiteUrl"`
	}
	if err := decode(c, &input); err != nil {
		return err
	}
	if input.DisplayName == nil || input.BioMarkdown == nil || input.WebsiteURL == nil {
		return fault.Validation
	}
	profile, err := h.Auth.UpdateProfile(c.Context(), principal(c), auth.ProfileInput{DisplayName: *input.DisplayName, BioMarkdown: *input.BioMarkdown, WebsiteURL: *input.WebsiteURL})
	if err != nil {
		return err
	}
	return c.JSON(profileJSON(profile))
}
func decode(c fiber.Ctx, target any) error {
	if strings.Split(c.Get("Content-Type"), ";")[0] != "application/json" {
		return fault.Validation
	}
	decoder := json.NewDecoder(bytes.NewReader(c.Body()))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fault.Validation
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return fault.Validation
	}
	return nil
}
