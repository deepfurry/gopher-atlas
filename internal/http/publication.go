package http

import "github.com/gofiber/fiber/v3"

func (h *Handler) registerPublication(api fiber.Router) {
	api.Get("/publication/status", func(c fiber.Ctx) error {
		result, err := h.Publication.Status(c.Context(), principal(c))
		if err != nil {
			return err
		}
		return c.JSON(result)
	})
	api.Get("/publication/jobs", func(c fiber.Ctx) error {
		after, err := cursor(c)
		if err != nil {
			return err
		}
		result, err := h.Publication.Jobs(c.Context(), principal(c), after)
		if err != nil {
			return err
		}
		return c.JSON(result)
	})
	api.Post("/publication/jobs/:id/actions/retry", func(c fiber.Ctx) error {
		id, err := userID(c)
		if err != nil {
			return err
		}
		result, err := h.Publication.Retry(c.Context(), principal(c), id)
		if err != nil {
			return err
		}
		return c.JSON(result)
	})
}
