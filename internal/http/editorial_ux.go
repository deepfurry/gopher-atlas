package http

import (
	"github.com/deepfurry/gopher-atlas/internal/auth"
	"github.com/gofiber/fiber/v3"
)

func (h *Handler) authors(c fiber.Ctx) error {
	after, err := cursor(c)
	if err != nil {
		return err
	}
	result, err := h.Auth.Authors(c.Context(), principal(c), after, c.Query("q"))
	if err != nil {
		return err
	}
	return c.JSON(result)
}
func (h *Handler) author(c fiber.Ctx) error {
	id, err := userID(c)
	if err != nil {
		return err
	}
	result, err := h.Auth.Author(c.Context(), principal(c), id)
	if err != nil {
		return err
	}
	return c.JSON(result)
}
func (h *Handler) updateAuthor(c fiber.Ctx) error {
	id, err := userID(c)
	if err != nil {
		return err
	}
	var input auth.ProfileInput
	if err = decodeRequired(c, &input, "displayName", "bioMarkdown", "websiteUrl"); err != nil {
		return err
	}
	if _, err = h.Auth.UpdateAuthorProfile(c.Context(), principal(c), id, input); err != nil {
		return err
	}
	return h.author(c)
}
func (h *Handler) pendingReviewDetail(c fiber.Ctx) error {
	id, err := userID(c)
	if err != nil {
		return err
	}
	result, err := h.Content.ReviewDetail(c.Context(), principal(c), id, 0)
	if err != nil {
		return err
	}
	return c.JSON(result)
}
func (h *Handler) reviewDetail(c fiber.Ctx) error {
	id, err := userID(c)
	if err != nil {
		return err
	}
	result, err := h.Content.ReviewDetail(c.Context(), principal(c), 0, id)
	if err != nil {
		return err
	}
	return c.JSON(result)
}
