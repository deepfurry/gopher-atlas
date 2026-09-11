package http

import (
	"bytes"
	"encoding/json"
	"strconv"

	"github.com/deepfurry/gopher-atlas/internal/content"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/gofiber/fiber/v3"
)

func (h *Handler) registerEditorial(api fiber.Router) {
	api.Get("/content", h.listContent)
	api.Post("/content", h.createContent)
	api.Get("/content/:id", h.getContent)
	api.Get("/content/:id/review", h.pendingReviewDetail)
	api.Get("/content/:id/routes", h.listRoutes)
	api.Put("/content/:id/draft", h.saveDraft)
	api.Post("/content/:id/actions/:action", h.contentAction)
	api.Get("/content/:id/revisions", h.listRevisions)
	api.Get("/content/:id/revisions/:revisionNo", h.getRevision)
	api.Post("/content/:id/revisions/:revisionNo/actions/restore", h.restoreRevision)
	api.Get("/reviews", h.listReviews)
	api.Get("/reviews/:id", h.reviewDetail)
	api.Get("/tags", h.listTags)
	api.Post("/tags", h.putTag)
	api.Put("/tags/:id", h.putTag)
	api.Get("/audit", h.listAudit)
}

func (h *Handler) listRoutes(c fiber.Ctx) error {
	id, err := userID(c)
	if err != nil {
		return err
	}
	after, err := cursor(c)
	if err != nil {
		return err
	}
	result, err := h.Content.Routes(c.Context(), principal(c), id, after)
	if err != nil {
		return err
	}
	return c.JSON(result)
}

// Whole-snapshot PUTs require every property, including false/empty values.
// This transport-only presence check does not interpret subtype payloads.
func decodeRequired(c fiber.Ctx, target any, keys ...string) error {
	return decodeRequiredNullable(c, target, nil, keys...)
}
func decodeRequiredNullable(c fiber.Ctx, target any, nullable []string, keys ...string) error {
	if err := decode(c, target); err != nil {
		return err
	}
	var props map[string]json.RawMessage
	if json.Unmarshal(c.Body(), &props) != nil {
		return fault.Validation
	}
	allowsNull := func(key string) bool {
		for _, n := range nullable {
			if n == key {
				return true
			}
		}
		return false
	}
	for key, value := range props {
		if !allowsNull(key) && bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return fault.Validation
		}
	}
	for _, key := range keys {
		value, ok := props[key]
		if !ok || (!allowsNull(key) && bytes.Equal(bytes.TrimSpace(value), []byte("null"))) {
			return fault.Validation
		}
	}
	return nil
}
func cursor(c fiber.Ctx) (int64, error) {
	n, err := strconv.ParseInt(c.Query("after", "0"), 10, 64)
	if err != nil || n < 0 {
		return 0, fault.Validation
	}
	return n, nil
}
func revisionNo(c fiber.Ctx) (int64, error) {
	n, err := strconv.ParseInt(c.Params("revisionNo"), 10, 64)
	if err != nil || n <= 0 {
		return 0, fault.Validation
	}
	return n, nil
}
func versionInput(c fiber.Ctx) (int64, error) {
	var input struct {
		Version int64 `json:"version"`
	}
	if err := decode(c, &input); err != nil {
		return 0, err
	}
	if input.Version <= 0 {
		return 0, fault.Validation
	}
	return input.Version, nil
}
func (h *Handler) createContent(c fiber.Ctx) error {
	var input struct {
		Type string `json:"type"`
	}
	if err := decodeRequired(c, &input, "type"); err != nil {
		return err
	}
	result, err := h.Content.Create(c.Context(), principal(c), input.Type)
	if err != nil {
		return err
	}
	return c.Status(201).JSON(result)
}
func (h *Handler) listContent(c fiber.Ctx) error {
	after, err := cursor(c)
	if err != nil {
		return err
	}
	archived := c.Query("includeArchived", "false")
	if archived != "true" && archived != "false" {
		return fault.Validation
	}
	owner, err := strconv.ParseInt(c.Query("ownerUserId", "0"), 10, 64)
	if err != nil || owner < 0 {
		return fault.Validation
	}
	result, err := h.Content.List(c.Context(), principal(c), after, archived == "true", content.Filters{Type: c.Query("type"), EditorialState: c.Query("editorialState"), Search: c.Query("q"), OwnerUserID: owner})
	if err != nil {
		return err
	}
	return c.JSON(result)
}
func (h *Handler) getContent(c fiber.Ctx) error {
	id, err := userID(c)
	if err != nil {
		return err
	}
	result, err := h.Content.Get(c.Context(), principal(c), id)
	if err != nil {
		return err
	}
	return c.JSON(result)
}
func (h *Handler) saveDraft(c fiber.Ctx) error {
	id, err := userID(c)
	if err != nil {
		return err
	}
	var input content.DraftInput
	if err := decodeRequiredNullable(c, &input, []string{"coverAssetId"}, "coverAssetId", "version", "title", "slug", "summary", "bodyMarkdown", "bylineUserId", "language", "featured", "seoTitle", "seoDescription", "payload", "tagIds", "topicEntries"); err != nil {
		return err
	}
	if input.Version <= 0 {
		return fault.Validation
	}
	result, err := h.Content.Save(c.Context(), principal(c), id, input)
	if err != nil {
		return err
	}
	return c.JSON(result)
}
func (h *Handler) contentAction(c fiber.Ctx) error {
	id, err := userID(c)
	if err != nil {
		return err
	}
	actor := principal(c)
	var result content.Detail
	switch c.Params("action") {
	case "submit-review":
		version, e := versionInput(c)
		if e != nil {
			return e
		}
		result, err = h.Content.Submit(c.Context(), actor, id, version)
	case "withdraw-review":
		result, err = h.Content.Withdraw(c.Context(), actor, id)
	case "request-changes":
		var input struct {
			RevisionID int64  `json:"revisionId"`
			Comment    string `json:"commentMarkdown"`
		}
		if e := decodeRequired(c, &input, "revisionId", "commentMarkdown"); e != nil {
			return e
		}
		if input.RevisionID <= 0 {
			return fault.Validation
		}
		result, err = h.Content.RequestChanges(c.Context(), actor, id, input.RevisionID, input.Comment)
	case "publish":
		var input struct {
			Mode       string  `json:"mode"`
			Version    *int64  `json:"version"`
			RevisionID *int64  `json:"revisionId"`
			Comment    *string `json:"commentMarkdown"`
		}
		if e := decodeRequired(c, &input, "mode"); e != nil {
			return e
		}
		switch input.Mode {
		case "direct":
			var direct struct {
				Mode    string `json:"mode"`
				Version int64  `json:"version"`
			}
			if e := decodeRequired(c, &direct, "mode", "version"); e != nil {
				return e
			}
			if input.Version == nil || *input.Version <= 0 || input.RevisionID != nil || input.Comment != nil {
				return fault.Validation
			}
			result, err = h.Content.PublishDirect(c.Context(), actor, id, *input.Version)
		case "reviewed":
			var reviewed struct {
				Mode       string `json:"mode"`
				RevisionID int64  `json:"revisionId"`
				Comment    string `json:"commentMarkdown"`
			}
			if e := decodeRequired(c, &reviewed, "mode", "revisionId"); e != nil {
				return e
			}
			if input.RevisionID == nil || *input.RevisionID <= 0 || input.Version != nil {
				return fault.Validation
			}
			comment := ""
			if input.Comment != nil {
				comment = *input.Comment
			}
			result, err = h.Content.PublishReviewed(c.Context(), actor, id, *input.RevisionID, comment)
		default:
			return fault.Validation
		}
	case "unpublish":
		result, err = h.Content.Unpublish(c.Context(), actor, id)
	case "archive":
		result, err = h.Content.Archive(c.Context(), actor, id)
	case "restore-archive":
		result, err = h.Content.RestoreArchive(c.Context(), actor, id)
	default:
		return fault.NotFound
	}
	if err != nil {
		return err
	}
	return c.JSON(result)
}
func (h *Handler) listRevisions(c fiber.Ctx) error {
	id, err := userID(c)
	if err != nil {
		return err
	}
	after, err := cursor(c)
	if err != nil {
		return err
	}
	result, err := h.Content.Revisions(c.Context(), principal(c), id, after)
	if err != nil {
		return err
	}
	return c.JSON(result)
}
func (h *Handler) getRevision(c fiber.Ctx) error {
	id, err := userID(c)
	if err != nil {
		return err
	}
	no, err := revisionNo(c)
	if err != nil {
		return err
	}
	result, err := h.Content.Revision(c.Context(), principal(c), id, no)
	if err != nil {
		return err
	}
	return c.JSON(result)
}
func (h *Handler) restoreRevision(c fiber.Ctx) error {
	id, err := userID(c)
	if err != nil {
		return err
	}
	no, err := revisionNo(c)
	if err != nil {
		return err
	}
	version, err := versionInput(c)
	if err != nil {
		return err
	}
	result, err := h.Content.RestoreRevision(c.Context(), principal(c), id, no, version)
	if err != nil {
		return err
	}
	return c.JSON(result)
}
func (h *Handler) listReviews(c fiber.Ctx) error {
	after, err := cursor(c)
	if err != nil {
		return err
	}
	switch c.Query("view", "pending") {
	case "pending":
		result, err := h.Content.PendingReviews(c.Context(), principal(c), after)
		if err != nil {
			return err
		}
		return c.JSON(result)
	case "history":
		result, err := h.Content.ReviewHistory(c.Context(), principal(c), after)
		if err != nil {
			return err
		}
		return c.JSON(result)
	default:
		return fault.Validation
	}
}
func (h *Handler) listTags(c fiber.Ctx) error {
	after, err := cursor(c)
	if err != nil {
		return err
	}
	result, err := h.Content.Tags(c.Context(), principal(c), after)
	if err != nil {
		return err
	}
	return c.JSON(result)
}
func (h *Handler) putTag(c fiber.Ctx) error {
	var id int64
	var err error
	if c.Method() == "PUT" {
		id, err = userID(c)
		if err != nil {
			return err
		}
	}
	var input content.TagInput
	if err := decodeRequired(c, &input, "name", "slug", "description"); err != nil {
		return err
	}
	result, err := h.Content.PutTag(c.Context(), principal(c), id, input)
	if err != nil {
		return err
	}
	if id == 0 {
		c.Status(201)
	}
	return c.JSON(result)
}
func (h *Handler) listAudit(c fiber.Ctx) error {
	after, err := cursor(c)
	if err != nil {
		return err
	}
	result, err := h.Content.Audit(c.Context(), principal(c), after)
	if err != nil {
		return err
	}
	return c.JSON(result)
}
