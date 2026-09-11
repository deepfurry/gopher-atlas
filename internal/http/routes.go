// Package http translates HTTP requests and responses; it owns no business policy.
package http

import (
	"errors"

	"github.com/deepfurry/gopher-atlas/internal/fault"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/requestid"
	"github.com/gofiber/utils/v2"
)

func (h *Handler) Register(server *fiber.App) {
	server.Get("/healthz", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})
	server.Get("/readyz", h.ready)
	server.Get("/api/auth/github", h.start)
	server.Get("/api/auth/github/callback", h.callback)
	server.Post("/api/auth/logout", h.requireSession, h.csrf, h.logout)
	api := server.Group("/api/admin/v1", h.requireSession)
	api.Get("/me", h.me)
	api.Use(h.active, h.csrf)
	api.Get("/users", h.listUsers)
	api.Get("/users/:id", h.getUser)
	api.Post("/users/:id/actions/:action", h.changeUser)
	api.Put("/users/:id/role", h.changeUser)
	api.Get("/authors/me", h.profile)
	api.Put("/authors/me", h.updateProfile)
	api.Get("/authors", h.authors)
	api.Get("/authors/:id", h.author)
	api.Put("/authors/:id/profile", h.updateAuthor)
	h.registerEditorial(api)
	h.registerAssets(api)
	h.registerPublication(api)
}

// ErrorHandler never exposes internal errors or reflects paths/query strings.
func ErrorHandler(c fiber.Ctx, err error) error {
	status, code, message := fiber.StatusInternalServerError, "internal_error", "An internal error occurred."
	var safe fault.Error
	if errors.As(err, &safe) {
		if info, ok := failures[safe]; ok {
			status, code, message = info.status, string(safe), info.message
		}
	}
	var fiberErr *fiber.Error
	if errors.As(err, &fiberErr) && fiberErr.Code == fiber.StatusNotFound {
		status, code, message = fiber.StatusNotFound, "not_found", "The resource was not found."
	}
	if errors.As(err, &fiberErr) && fiberErr.Code == fiber.StatusMethodNotAllowed {
		status, code, message = 405, "method_not_allowed", "The method is not allowed."
	}
	if errors.As(err, &fiberErr) && fiberErr.Code == fiber.StatusRequestEntityTooLarge {
		status, code, message = 413, "payload_too_large", "The request is too large."
	}
	id := requestid.FromContext(c)
	if id == "" {
		id = utils.UUIDv4()
		c.Set(fiber.HeaderXRequestID, id)
	}
	return c.Status(status).JSON(fiber.Map{
		"error": fiber.Map{"code": code, "message": message, "requestId": id},
	})
}

var failures = map[fault.Error]struct {
	status  int
	message string
}{
	fault.AssetInvalid:              {422, "The image is invalid."},
	fault.AssetTooLarge:             {413, "Images must not exceed 10 MiB."},
	fault.AssetFormat:               {422, "Only PNG, JPEG, WebP and GIF are supported."},
	fault.AssetDimensions:           {422, "Image dimensions exceed the limit."},
	fault.AssetDeleted:              {409, "This asset is soft deleted. An Admin must restore it before selection."},
	fault.StorageUnavailable:        {503, "Object storage is unavailable."},
	fault.StorageIntegrity:          {409, "Immutable object integrity check failed."},
	fault.PublicationNotConfigured:  {503, "The publication pipeline is not configured."},
	fault.PublicationConflict:       {409, "The publication job state changed."},
	fault.PublicationRetryForbidden: {409, "This publication job cannot be retried."},
	fault.SnapshotInvalid:           {422, "The public snapshot is invalid."},
	fault.SnapshotStale:             {409, "A newer publication generation exists."},
	fault.BuildTrigger:              {502, "The build trigger was not accepted."},
	fault.Authentication:            {401, "Sign in to continue."},
	fault.Pending:                   {403, "Your account is waiting for administrator approval."},
	fault.Disabled:                  {403, "Your account is disabled."},
	fault.Permission:                {403, "You do not have permission to perform this action."},
	fault.CSRF:                      {403, "The request origin or CSRF token is invalid."},
	fault.State:                     {400, "The login attempt is invalid or expired. Start again."},
	fault.OAuth:                     {502, "GitHub identity could not be resolved. Start again."},
	fault.Validation:                {400, "The request is invalid."},
	fault.NotFound:                  {404, "The resource was not found."},
	fault.LastAdmin:                 {409, "At least one active administrator must remain."},
	fault.Unavailable:               {503, "A required local dependency is unavailable."},
	fault.ContentVersion:            {409, "The draft changed. Reload before saving."},
	fault.EditorialState:            {409, "The action is not allowed in the current editorial state."},
	fault.RouteConflict:             {409, "The route is reserved by another content item."},
	fault.ReviewRevision:            {409, "The requested revision is not the pending review revision."},
	fault.SelfReview:                {403, "Reviewers cannot review content they own or authored."},
	fault.ContentArchived:           {409, "Restore the archived content before editing."},
	fault.NotPublished:              {409, "The content has no selected published revision."},
	fault.Markdown:                  {422, "The Markdown is unsafe or exceeds its limit."},
	fault.Payload:                   {422, "The typed payload is invalid."},
	fault.TagConflict:               {409, "The tag name or slug is already in use."},
	fault.TopicTarget:               {422, "Every topic target must be published and not archived."},
}
