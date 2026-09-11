package http

import (
	"github.com/deepfurry/gopher-atlas/internal/assets"
	"github.com/deepfurry/gopher-atlas/internal/content"
	"github.com/deepfurry/gopher-atlas/internal/fault"
	"github.com/gofiber/fiber/v3"
	"io"
	"mime"
	"strings"
)

// Only the exact multipart upload endpoint receives the larger parser ceiling.
func BodyLimits(c fiber.Ctx) error {
	if len(c.Body()) > RequestBodyLimit(c.Method(), c.Path(), c.Get(fiber.HeaderContentType)) {
		return fiber.ErrRequestEntityTooLarge
	}
	return c.Next()
}
func RequestBodyLimit(method, target, contentType string) int {
	path, _, _ := strings.Cut(target, "?")
	media, _, _ := mime.ParseMediaType(contentType)
	if method == "POST" && path == "/api/admin/v1/assets" && media == "multipart/form-data" {
		return assets.OuterBodyLimit
	}
	return content.JSONBodyLimit
}
func (h *Handler) registerAssets(api fiber.Router) {
	api.Get("/assets", h.listAssets)
	api.Post("/assets", h.uploadAsset)
	api.Post("/assets/:id/actions/delete", h.deleteAsset)
	api.Post("/assets/:id/actions/restore", h.restoreAsset)
}
func (h *Handler) listAssets(c fiber.Ctx) error {
	after, err := cursor(c)
	if err != nil {
		return err
	}
	deleted := c.Query("includeDeleted", "false")
	if deleted != "true" && deleted != "false" {
		return fault.Validation
	}
	result, err := h.Assets.List(c.Context(), principal(c), after, deleted == "true")
	if err != nil {
		return err
	}
	return c.JSON(result)
}
func (h *Handler) uploadAsset(c fiber.Ctx) error {
	media, _, err := mime.ParseMediaType(c.Get(fiber.HeaderContentType))
	if err != nil || media != "multipart/form-data" {
		return fault.AssetInvalid
	}
	form, err := c.MultipartForm()
	if err != nil || len(form.File) != 1 || len(form.Value) != 0 || len(form.File["file"]) != 1 {
		return fault.AssetInvalid
	}
	file := form.File["file"][0]
	if file.Size > assets.MaxFileBytes {
		return fault.AssetTooLarge
	}
	reader, err := file.Open()
	if err != nil {
		return fault.AssetInvalid
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, assets.MaxFileBytes+1))
	if err != nil {
		return fault.AssetInvalid
	}
	result, err := h.Assets.Upload(c.Context(), principal(c), data)
	if err != nil {
		return err
	}
	return c.Status(201).JSON(result)
}
func (h *Handler) assetDeleted(c fiber.Ctx, deleted bool) error {
	id, err := userID(c)
	if err != nil {
		return err
	}
	result, err := h.Assets.SetDeleted(c.Context(), principal(c), id, deleted)
	if err != nil {
		return err
	}
	return c.JSON(result)
}
func (h *Handler) deleteAsset(c fiber.Ctx) error  { return h.assetDeleted(c, true) }
func (h *Handler) restoreAsset(c fiber.Ctx) error { return h.assetDeleted(c, false) }
